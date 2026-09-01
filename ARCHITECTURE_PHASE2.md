# Arquitectura Fase 2 - informegaming

**Fecha:** 2026-08-31  
**Agente:** jd-architect  
**Contexto:** Fase 2 - C1-C5, H3, H6 | Fuentes: RESEARCH_NOTICIAS.md, ARCHITECTURE.md, PHASE1_PLAN.md, código actual

---

## Decisiones Arquitectónicas (ADRs)

### ADR-006: Noticias - Markdown en Repo como Fuente Principal

**Problema:** WordPress API inaccesible (Cloudflare challenge). Necesitamos fuente de noticias fiable, versionada, sin dependencias externas.

**Alternativas:**
1. **Worker proxy con bypass Cloudflare** — Frágil, IPs Workers bloqueadas, mantenimiento alto. ❌
2. **Servicio tercero RSS→JSON (rss2json, etc.)** — Dependencia externa, rate limits, posible costo. ⚠️
3. **Markdown en repo (`content/noticias/*.md`) + Build script** — Control total, versionado, gratis, CI/CD nativo. ✅
4. **Headless CMS (Contentful, Sanity)** — Overkill, configuración extra. ❌

**Decisión:** **Opción 3** — Markdown en repo como fuente principal.

**Motivo:**
- Cero dependencias externas
- Versionado en Git (auditoría, rollback instantáneo)
- Build-time generation → JSON estático → CDN
- Editores técnicos usan Git/Markdown; no-técnicos: GitHub web editor
- Pipeline existente (GitHub Actions build + deploy) lo soporta nativamente

**Trade-offs:**
- ❌ Requiere conocimiento Git/Markdown para añadir noticias
- ✅ Ganamos: robustez, costo $0, latencia <50ms, observabilidad completa

**Consecuencias:**
- Nuevo directorio `content/noticias/`
- Build script `scripts/build-noticias.ts` (ejecutado en `npm run build` y CI)
- Worker `/noticias` lee de KV `noticias.json` (poblado por build + commit)
- Frontend `noticias.js` ya compatible con schema propuesto

---

### ADR-007: Security Headers + CSP Restrictivo

**Problema:** Sitio expuesto sin headers de seguridad; CSP necesario para mitigar XSS; rate limiting para proteger Worker.

**Decisión:** Implementar middleware de seguridad en Worker + headers en frontend (meta CSP fallback).

**Headers Worker (todas las respuestas):**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://informegaming-ingest.informegaming-ingest.workers.dev https://www.gamerpower.com https://api.parse.bot https://reco-public.rec.mp.microsoft.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

**CSP Análisis:**
- `script-src 'self' 'unsafe-inline'`: Necesario por scripts inline en `index.html` (migrar a archivos en v2)
- `style-src 'self' 'unsafe-inline'`: Estilos inline en HTML + dinámicos JS
- `connect-src`: Worker API + fuentes externas (GamerPower, Parse.bot, Microsoft Store)
- `frame-ancestors 'none'`: Previene clickjacking
- `img-src https:`: Imágenes de CDNs externas (Epic, GamerPower, Microsoft)

**Frontend:** Meta tag CSP en `index.html` como defensa en profundidad (report-only inicialmente).

---

### ADR-008: Rate Limiting KV-Backed (Sliding Window)

**Problema:** Proteger `/ingest` (trigger manual) y `/games` (lectura pública) de abuso.

**Decisión:** Sliding window con Cloudflare KV.

**Diseño:**
- Key: `ratelimit:{ip}:{endpoint}` (ej: `ratelimit:1.2.3.4:/games`)
- Ventana: 60 segundos
- Límite: 10 requests/ventana
- TTL automático: 60s (expira solo)
- Header respuesta: `X-RateLimit-Limit: 10`, `X-RateLimit-Remaining: N`, `Retry-After: segundos`

**Implementación:**
```typescript
// middleware/rateLimit.ts
export async function rateLimit(request: Request, env: Env, limit = 10, windowMs = 60000): Promise<Response | null> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const url = new URL(request.url);
  const key = `ratelimit:${ip}:${url.pathname}`;
  
  const current = await env.KV_NAMESPACE.get(key, 'json') as { count: number; resetAt: number } | null;
  const now = Date.now();
  
  if (!current || now > current.resetAt) {
    await env.KV_NAMESPACE.put(key, JSON.stringify({ count: 1, resetAt: now + windowMs }), { expirationTtl: 60 });
    return null; // OK
  }
  
  if (current.count >= limit) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return new Response('Too Many Requests', { 
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(current.resetAt / 1000))
      }
    });
  }
  
  current.count++;
  await env.KV_NAMESPACE.put(key, JSON.stringify(current), { expirationTtl: 60 });
  return null; // OK
}
```

**Aplicar a:** `/ingest` (POST/GET), `/games` (GET), `/noticias` (GET/POST)

---

### ADR-009: Health Checks Extendidos + Alerting

**Problema:** `/health` actual solo retorna `{status: 'ok'}`. Necesita checks reales de dependencias.

**Decisión:** `/health` con checks granulares + status codes semánticos + GitHub Issue auto.

**Checks:**
| Check | Descripción | Fallo → |
|-------|-------------|---------|
| `kv_read` | `KV.get('juegos.json')` | degraded |
| `kv_write` | `KV.put('health-test', ...)` | down |
| `github_token` | Validar `GITHUB_TOKEN` reachable | degraded |
| `source_epic` | HEAD `api.parse.bot` (timeout 5s) | degraded |
| `source_gamerpower` | HEAD `gamerpower.com` (timeout 5s) | degraded |
| `source_xbox` | HEAD `reco-public.rec.mp.microsoft.com` (timeout 5s) | degraded |
| `last_ingest` | `generatedAt` < 36h ago | degraded |

**Status Aggregation:**
- All OK → `200 OK` + `{status: 'ok', checks: {...}}`
- Any degraded → `200 OK` + `{status: 'degraded', checks: {...}}`
- KV write down → `503 Service Unavailable` + `{status: 'down', checks: {...}}`

**Alerting:** GitHub Actions `ingest.yml` ya tiene job `notify` en `failure()` → crea Issue. Verificar y mejorar.

---

### ADR-010: SEO + JSON-LD + Sitemap

**Problema:** Sitio sin meta tags dinámicos, Open Graph, structured data, sitemap.

**Decisión:** Generación build-time + inyección runtime por sección.

**Meta tags por sección:**
| Sección | Title | Description | OG Type | JSON-LD |
|---------|-------|-------------|---------|---------|
| Home/Noticias | "informegaming - Noticias gaming" | "Últimas noticias..." | `website` | `NewsArticle[]` |
| Juegos Gratis | "informegaming - Juegos Gratis" | "Juegos gratis esta semana..." | `website` | `Game[]` (ItemList) |
| Historial | "informegaming - Historial" | "Historial de juegos expirados..." | `website` | `ItemList` |

**JSON-LD `Game` (schema.org):**
```json
{
  "@context": "https://schema.org",
  "@type": "Game",
  "name": "Cat Quest II",
  "gamePlatform": "PC",
  "url": "https://store.epicgames.com/...",
  "image": "https://cdn.epicgames.com/...",
  "description": "Open-world action-RPG...",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR", "availability": "https://schema.org/InStock" }
}
```

**JSON-LD `NewsArticle`:**
```json
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "Epic Games regala 3 juegos",
  "datePublished": "2026-08-30T10:00:00Z",
  "image": "https://cdn.epicgames.com/...",
  "author": { "@type": "Organization", "name": "informegaming" },
  "publisher": { "@type": "Organization", "name": "informegaming" }
}
```

**Sitemap:** Generado en build (`vite-plugin-sitemap` o script custom) con URLs: `/`, `/#noticias`, `/#gratis`, `/#historial`

---

### ADR-011: Accesibilidad Core (WCAG 2.1 AA)

**Problema:** Filtros sin ARIA, focus invisible, imágenes sin alt semántico, contraste no verificado.

**Decisión:** Implementar mejoras mínimas de alto impacto.

**Filtros (Noticias + Juegos):**
```html
<div role="tablist" aria-label="Filtrar por plataforma">
  <button role="tab" aria-selected="true" aria-controls="panel-all" data-filter="all">Todas</button>
  <button role="tab" aria-selected="false" aria-controls="panel-epic" data-filter="Epic">Epic</button>
  ...
</div>
<div role="tabpanel" id="panel-all" aria-labelledby="tab-all">...</div>
```

**Focus Visible:**
```css
:focus-visible {
  outline: 2px solid #00ffcc;
  outline-offset: 2px;
}
button:focus-visible, a:focus-visible, [role="tab"]:focus-visible { ... }
```

**Alt Semántico:**
- Juegos: `alt="${title} - Imagen del juego gratis en ${platform}"`
- Noticias: `alt="${title} - Imagen de la noticia"`

**Contraste:** Verificar ratio ≥ 4.5:1 (texto normal), ≥ 3:1 (large text 18px+). Ajustar colores en `style.css` si necesario.

---

## Esquemas de Datos Actualizados

### NewsArticle (Worker + Frontend)
```typescript
interface NewsArticle {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;           // ISO 8601
  image?: string;
  url?: string;
  categories: string[];
  tags: string[];
  author?: string;
  source: 'markdown';
  raw: Record<string, unknown>;
}
```

### Worker Output: `noticias.json`
```json
{
  "generatedAt": "2026-08-31T15:00:00.000Z",
  "version": "1.0",
  "noticias": [ NewsArticle, ... ]
}
```

---

## Diagramas

### Secuencia: Build Noticias
```
Git Push (main)
    │
    ▼
GitHub Actions: build job
    │
    ├── npm ci
    ├── npm run build
    │       │
    │       ├── vite build (frontend)
    │       └── tsx scripts/build-noticias.ts  ← NUEVO
    │               │
    │               ├── Lee content/noticias/*.md
    │               ├── Parse frontmatter + markdown
    │               ├── Genera public/data/noticias.json
    │               └── Escribe dist/data/noticias.json
    │
    ├── Upload artifact (dist/)
    └── Deploy GitHub Pages
```

### Worker `/noticias` Flow
```
GET /noticias
    │
    ├── KV.get('noticias.json') → hit → return JSON
    │
    └── miss → fetch GitHub raw (fallback) → return JSON

POST /noticias (manual trigger)
    │
    ├── Ejecuta build-noticias.ts logic
    ├── KV.put('noticias.json')
    ├── GitHub commit (opcional, via GITHUB_TOKEN)
    └── Return result
```

---

## Archivos a Crear/Modificar

### Worker (Backend)
| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `worker/src/types.ts` | Extender | Añadir `NewsArticle`, `HealthCheck`, `RateLimitConfig` |
| `worker/src/sources/noticias.ts` | Crear | Build script logic (reutilizable) + fetch KV |
| `worker/src/middleware/rateLimit.ts` | Crear | Sliding window KV rate limiter |
| `worker/src/middleware/securityHeaders.ts` | Crear | CSP + headers seguridad |
| `worker/src/health.ts` | Crear | Checks granulares + agregación |
| `worker/src/index.ts` | Modificar | Integrar middlewares, rutas `/noticias`, `/health` extendido |
| `worker/wrangler.toml` | Verificar | KV namespace para noticias (¿necesario namespace separado?) |

### Frontend
| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `index.html` | Modificar | Meta base, CSP meta, ARIA filtros, JSON-LD placeholders |
| `src/js/seo.js` | Crear | Inyección dinámica meta/OG/JSON-LD por sección |
| `src/js/noticias.js` | Modificar | Alt semántico, schema NewsArticle |
| `src/js/juegos.js` | Modificar | Alt semántico, schema Game |
| `src/css/style.css` | Modificar | `:focus-visible`, contraste |
| `vite.config.js` | Modificar | Plugin sitemap, build script noticias |
| `scripts/build-noticias.ts` | Crear | Procesa Markdown → noticias.json |
| `content/noticias/*.md` | Crear | Ejemplos de noticias |
| `public/robots.txt` | Crear | Allow all, sitemap reference |

### Testing
| Archivo | Acción |
|---------|--------|
| `worker/vitest.config.ts` | Crear |
| `worker/src/__tests__/sources/*.test.ts` | Crear |
| `worker/src/__tests__/utils/*.test.ts` | Crear |
| `worker/src/__tests__/middleware/*.test.ts` | Crear |
| `worker/src/__tests__/health.test.ts` | Crear |
| `worker/src/__tests__/index.integration.test.ts` | Crear |
| `playwright.config.ts` | Crear (raíz) |
| `tests/e2e/smoke.spec.ts` | Crear |
| `tests/e2e/noticias.spec.ts` | Crear |
| `tests/e2e/juegos.spec.ts` | Crear |

### CI/CD
| Archivo | Acción |
|---------|--------|
| `.github/workflows/test.yml` | Crear (PR: vitest + playwright) |
| `.github/workflows/deploy-preview.yml` | Crear (opcional, preview PR) |
| `.github/workflows/ingest.yml` | Modificar (mejorar notificación) |

---

## Riesgos y Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| CSP rompe scripts inline | Media | Alto | `unsafe-inline` temporal; migrar a archivos en v2 |
| Rate limit false positives (IP compartida) | Media | Medio | CF-Connecting-IP header; ventana sliding; TTL auto |
| Health check false positive (fuente down temporal) | Media | Bajo | Threshold: 2/3 fuentes OK = degraded; no down |
| Playwright flaky en CI | Media | Medio | waitForSelector, timeouts generosos, retry 1x |
| Markdown noticias: editores no técnicos | Baja | Medio | Documentar GitHub web editor; templates |
| Sitemap no cubre URLs SPA (anchors) | Baja | Bajo | Incluir solo rutas base; SPA maneja routing cliente |

---

## Próximos Pasos para jd-master

1. **Aprobar arquitectura** (este documento)
2. **Ejecutar Fase 2.2 (Paralelo):**
   - jd-backend: Tareas 2.4, 2.5, 2.6 (Worker endpoints, rate limit, health)
   - jd-frontend: Tareas 2.7, 2.8 (SEO, A11y)
3. **Validar build/tests** tras cada cambio importante
4. **Fase 2.3 (Secuencial):** jd-qa → jd-security → jd-devil-advocate → jd-reviewer

---

**Firmado:** jd-architect  
**Estado:** COMPLETED — Arquitectura definida, lista para implementación