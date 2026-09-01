# Plan Detallado - Fase 2: Críticos + Noticias + Testing Foundation

**Proyecto:** informegaming  
**Fase:** 2 - Críticos + Noticias + Testing Foundation  
**Complejidad:** LEVEL 2 (Feature media + nueva integración + seguridad + testing)  
**Equipo:** jd-planner + jd-researcher + jd-architect → jd-backend + jd-frontend → jd-qa → jd-security → jd-devil-advocate → jd-reviewer  
**Fuentes:** plan.md, ARCHITECTURE.md, PHASE1_PLAN.md, código actual  
**Contexto:** Fase 1 completada (Worker con Epic + GamerPower + Xbox, GitHub Actions ingest + deploy, frontend consume datos estáticos con fallback Worker)

---

## Desglose de Tareas

### Tarea 2.1: Investigación y Validación Fuentes Noticias (C1)
- **Objetivo:** Validar fuentes RSS/JSON Feed WordPress para noticias; definir estrategia fallback
- **Dependencias:** Ninguna (inicio paralelo)
- **Agente:** jd-researcher
- **Clasificación:** PARALLELIZABLE
- **Investigación:**
  - Probar `https://informegaming.gt.tc/feed/json` (JSON Feed nativo WP)
  - Probar `https://informegaming.gt.tc/wp-json/wp/v2/posts?_embed` (REST API con embed media)
  - Probar `https://informegaming.gt.tc/feed/` (RSS 2.0 estándar)
  - Evaluar: CORS, challenge JS, formato respuesta, frecuencia actualización
  - Definir esquema `NewsArticle` compatible con frontend actual
- **Criterio de aceptación:**
  - Documento con: fuente recomendada, endpoint, formato respuesta, campos mapeados, limitaciones
  - Si WP falla: estrategia Markdown en repo (`content/noticias/*.md`) + script build

### Tarea 2.2: Arquitectura Worker - Endpoints + CSP + Rate Limiting + Health Checks (C1, C5, H3, H6)
- **Objetivo:** Diseñar endpoints `/noticias`, `/health` extendido, CSP headers, rate limiting KV, CORS restrictivo
- **Dependencias:** Ninguna (inicio paralelo)
- **Agente:** jd-architect
- **Clasificación:** PARALLELIZABLE
- **Diseño:**
  - **Endpoint `/noticias`:** GET (fetch KV `noticias.json`), POST (trigger ingest noticias)
  - **Endpoint `/health` extendido:** checks KV (read/write), GitHub API (token válido), Fuentes externas (Epic, GP, Xbox reachability), timestamp última ingest
  - **Rate Limiting:** KV-backed sliding window (10 req/min/IP) para `/ingest` y `/games`; key: `ratelimit:{ip}:{endpoint}`
  - **CSP:** `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://informegaming-ingest.workers.dev https://www.gamerpower.com https://api.parse.bot https://reco-public.rec.mp.microsoft.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - **Headers seguridad:** `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`
  - **CORS restrictivo:** Solo orígenes permitidos (GitHub Pages URL + localhost)
- **Criterio de aceptación:**
  - ADR documentado con decisiones y trade-offs
  - Diagrama secuencia health checks
  - Esquema `NewsArticle` definido

### Tarea 2.3: Planificación Detallada Tareas Implementación (todas)
- **Objetivo:** Descomponer en tareas atómicas con dependencias, criterios aceptación, validación
- **Dependencias:** Tareas 2.1, 2.2 (outputs)
- **Agente:** jd-planner
- **Clasificación:** SEQUENTIAL (después de research + arch)
- **Entregable:** Este documento actualizado con matriz dependencias y asignación agentes

---

### Tarea 2.4: Worker - Endpoint `/noticias` + Build Script Markdown (C1)
- **Objetivo:** Implementar GET/POST `/noticias`; GET lee KV `noticias.json` (poblado por build script); POST ejecuta build script Markdown → KV + commit GitHub; build script `scripts/build-noticias.ts` procesa `content/noticias/*.md` → `public/data/noticias.json`
- **Dependencias:** 2.1 (fuente validada: Markdown en repo), 2.2 (arch diseño)
- **Agente:** jd-backend
- **Clasificación:** PARALLELIZABLE (con 2.5, 2.6)
- **Archivos:**
  - `worker/src/sources/noticias.ts` (nuevo) - lógica build Markdown + fetch KV
  - `worker/src/types.ts` (extend) - interface `NewsArticle`
  - `worker/src/index.ts` (modificar) - rutas `/noticias` GET/POST
  - `scripts/build-noticias.ts` (nuevo) - procesa Markdown frontmatter → noticias.json
  - `content/noticias/*.md` (nuevos) - ejemplos de noticias
  - `worker/wrangler.toml` (verificar) - KV namespace único (reutilizar KV_NAMESPACE)
- **Criterio de aceptación:**
  - `curl /noticias` retorna JSON con `generatedAt`, `version`, `noticias: NewsArticle[]`
  - `curl -X POST /noticias` ejecuta build script y actualiza KV
  - `npm run build` ejecuta `scripts/build-noticias.ts` y genera `public/data/noticias.json` + `dist/data/noticias.json`
  - GitHub Action commitea `public/data/noticias.json` tras build

### Tarea 2.5: Worker - Rate Limiting KV + Security Headers (C5, H6)
- **Objetivo:** Middleware rate limiting (10 req/min/IP) para `/ingest` y `/games`; headers CSP, X-Frame-Options, Referrer-Policy, etc.
- **Dependencias:** 2.2 (arch diseño)
- **Agente:** jd-backend
- **Clasificación:** PARALLELIZABLE (con 2.4, 2.6)
- **Archivos:**
  - `worker/src/middleware/rateLimit.ts` (nuevo) - sliding window KV
  - `worker/src/middleware/securityHeaders.ts` (nuevo) - CSP + headers
  - `worker/src/index.ts` (modificar) - aplicar middlewares
- **Criterio de aceptación:**
  - 11ª request en < 1 min retorna 429 con `Retry-After`
  - Headers presentes en todas las respuestas
  - CSP no rompe frontend (scripts, styles, images, fonts, connect)
  - Rate limit key expira automáticamente (TTL 60s)

### Tarea 2.6: Worker - Health Checks Extendidos + GitHub Issue Auto (H3)
- **Objetivo:** `/health` con checks: KV read/write, GitHub API token, fuentes externas reachability, última ingest timestamp; alerta GitHub Issue si falla
- **Dependencias:** 2.2 (arch diseño)
- **Agente:** jd-backend
- **Clasificación:** PARALLELIZABLE (con 2.4, 2.5)
- **Archivos:**
  - `worker/src/health.ts` (nuevo) - funciones check individuales + agregado
  - `worker/src/index.ts` (modificar) - ruta `/health` extendida
  - `.github/workflows/ingest.yml` (modificar) - mejorar notificación fallo
- **Criterio de aceptación:**
  - `/health` retorna JSON: `{ status: 'ok'|'degraded'|'down', checks: { kv: bool, github: bool, sources: { epic: bool, gamerpower: bool, xbox: bool }, lastIngest: string } }`
  - Status 200 si ok, 503 si degraded/down
  - GitHub Issue creado automáticamente en fallo pipeline (ya existe en ingest.yml, verificar)

### Tarea 2.7: Frontend - SEO Meta Tags Dinámicos + Open Graph + JSON-LD (C2)
- **Objetivo:** Meta tags por página (noticias, juegos, historial); Open Graph completo; JSON-LD `Game` (juegos) + `NewsArticle` (noticias); `sitemap.xml` generado en build
- **Dependencias:** 2.1 (esquema NewsArticle)
- **Agente:** jd-frontend
- **Clasificación:** PARALLELIZABLE (con 2.8)
- **Archivos:**
  - `index.html` (modificar) - meta base + placeholders para dinámico
  - `src/js/seo.js` (nuevo) - inyección meta tags, OG, JSON-LD según sección activa
  - `vite.config.js` (modificar) - plugin `vite-plugin-sitemap` o script build custom
  - `public/robots.txt` (nuevo)
- **Criterio de aceptación:**
  - View source muestra: `<title>`, `<meta name="description">`, `<meta property="og:*">`, `<meta name="twitter:*">`, `<script type="application/ld+json">`
  - JSON-LD válido (validator.schema.org)
  - `npm run build` genera `dist/sitemap.xml` con URLs: `/`, `/#noticias`, `/#gratis`, `/#historial`
  - `robots.txt` permite crawling, referencia sitemap

### Tarea 2.8: Frontend - Accesibilidad Core (C3)
- **Objetivo:** ARIA en filtros (`role="tablist"`, `aria-selected`, `aria-controls`), focus visible (`:focus-visible`), `alt` semántico en imágenes, audit contraste WCAG AA
- **Dependencias:** Ninguna (independiente)
- **Agente:** jd-frontend
- **Clasificación:** PARALLELIZABLE (con 2.7)
- **Archivos:**
  - `index.html` (modificar) - ARIA en filtros noticias y juegos
  - `src/css/style.css` (modificar) - `:focus-visible` styles, contraste
  - `src/js/noticias.js` (modificar) - `alt` semántico en `crearImagenNoticia`
  - `src/js/juegos.js` (modificar) - `alt` semántico en `crearCardJuego`
- **Criterio de aceptación:**
  - Filtros: `role="tablist"`, botones `role="tab"`, `aria-selected="true|false"`, `aria-controls="panel-id"`
  - Focus visible: outline claro en todos los elementos interactivos (botones, enlaces, inputs)
  - Imágenes: `alt` descriptivo (título juego/noticia), no "imagen" genérico
  - Contraste: ratio ≥ 4.5:1 texto normal, ≥ 3:1 large text (verificar con axe DevTools)
  - Navegación teclado completa (Tab, Enter, Escape)

---

### Tarea 2.9: Testing - Vitest Worker (Unit + Integración) (C4)
- **Objetivo:** Tests unitarios sources (epic, gamerpower, xbox, noticias), normalize, dedup, rateLimit, health; test integración worker endpoints
- **Dependencias:** 2.4, 2.5, 2.6 (código a testear)
- **Agente:** jd-qa
- **Clasificación:** SEQUENTIAL (después de implementación backend)
- **Archivos:**
  - `worker/package.json` (add: vitest, @cloudflare/workers-types, msw)
  - `worker/vitest.config.ts` (nuevo)
  - `worker/src/__tests__/sources/*.test.ts` (nuevos)
  - `worker/src/__tests__/utils/normalize.test.ts`
  - `worker/src/__tests__/utils/rateLimit.test.ts`
  - `worker/src/__tests__/health.test.ts`
  - `worker/src/__tests__/index.integration.test.ts`
- **Criterio de aceptación:**
  - `npm test` en worker → 100% pass
  - Cobertura: sources 80%+, normalize 100%, dedup 100%, rateLimit 90%+, health 80%+
  - Edge cases: API down, empty response, malformed dates, rate limit exceeded, KV errors

### Tarea 2.10: Testing - Playwright E2E Smoke (C4)
- **Objetivo:** Smoke tests: home load → sección noticias → sección juegos → filter Epic → countdown → historial
- **Dependencias:** 2.7, 2.8 (frontend completo)
- **Agente:** jd-qa
- **Clasificación:** SEQUENTIAL (después de frontend)
- **Archivos:**
  - `playwright.config.ts` (nuevo, raíz proyecto)
  - `tests/e2e/smoke.spec.ts` (nuevo)
  - `tests/e2e/noticias.spec.ts` (nuevo)
  - `tests/e2e/juegos.spec.ts` (nuevo)
  - `package.json` (add: @playwright/test, playwright)
- **Criterio de aceptación:**
  - `npx playwright test` → PASS
  - Tests cubren: carga inicial, navegación tabs, filtros juegos (Epic), countdown actualiza, historial muestra expirados
  - Tests corren en CI (GitHub Actions)

### Tarea 2.11: GitHub Actions - Test Job en PR + Staging Preview (C4)
- **Objetivo:** Workflow `test.yml` en PR (vitest + playwright); deploy preview en PR (GitHub Pages staging o Netlify preview)
- **Dependencias:** 2.9, 2.10
- **Agente:** jd-qa (con apoyo jd-backend para workflow)
- **Clasificación:** SEQUENTIAL (después de tests)
- **Archivos:**
  - `.github/workflows/test.yml` (nuevo)
  - `.github/workflows/deploy-preview.yml` (nuevo, opcional)
- **Criterio de aceptación:**
  - PR abre → `test.yml` ejecuta vitest + playwright → status check requerido
  - Preview deploy accesible en URL única por PR
  - Main branch → deploy producción (ya existe)

---

### Tarea 2.12: Security Audit (C5, H6)
- **Objetivo:** Auditar CSP effectiveness, rate limiting bypass, headers completos, secrets management, CORS
- **Dependencias:** 2.4, 2.5, 2.6, 2.7 (implementación completa)
- **Agente:** jd-security
- **Clasificación:** SEQUENTIAL (después de implementación + tests)
- **Entregable:** Informe hallazgos CRITICAL/HIGH/MEDIUM/LOW con mitigación

### Tarea 2.13: Devil's Advocate - Pre-mortem Fase 2 (todas)
- **Objetivo:** Análisis adversario: ¿qué puede fallar en producción? Rate limit bypass, CSP breaking, health check false positives, noticias vacías, test flakiness, deploy preview failures
- **Dependencias:** 2.12 (security audit completo)
- **Agente:** jd-devil-advocate
- **Clasificación:** SEQUENTIAL (después de security)

### Tarea 2.14: Review Final + Sign-off (todas)
- **Objetivo:** Revisión final: requisitos cumplidos, arquitectura coherente, código limpio, tests pasan, seguridad OK, riesgos mitigados
- **Dependencias:** 2.13
- **Agente:** jd-reviewer
- **Clasificación:** SEQUENTIAL (último)

---

## Matriz de Dependencias

```
FASE 2.1 - RESEARCH + ARCHITECTURE (PARALELO)
├── 2.1 jd-researcher: Fuentes Noticias ──────────────────────┐
├── 2.2 jd-architect: Worker Design (endpoints, CSP, RL, Health) ┤
└── 2.3 jd-planner: Plan detallado (este doc) ─────────────────┘
                              │
                              ▼
FASE 2.2 - IMPLEMENTACIÓN BACKEND + FRONTEND (PARALELO)
├── 2.4 jd-backend: /noticias endpoint + ingest ────────────────┐
├── 2.5 jd-backend: Rate Limiting + Security Headers ───────────┤
├── 2.6 jd-backend: Health Checks + GitHub Issue ───────────────┤
├── 2.7 jd-frontend: SEO + OG + JSON-LD + Sitemap ──────────────┤
└── 2.8 jd-frontend: Accesibilidad ARIA + Focus + Contraste ────┘
                              │
                              ▼
FASE 2.3 - TESTING (SECUENCIAL)
├── 2.9 jd-qa: Vitest Worker ───────────────────────────────────┐
├── 2.10 jd-qa: Playwright E2E ─────────────────────────────────┤
└── 2.11 jd-qa: GitHub Actions Test + Preview ──────────────────┘
                              │
                              ▼
FASE 2.4 - VALIDACIÓN FINAL (SECUENCIAL ESTRICTA)
├── 2.12 jd-security: Auditoría ────────────────────────────────┐
├── 2.13 jd-devil-advocate: Pre-mortem ─────────────────────────┤
└── 2.14 jd-reviewer: Sign-off ─────────────────────────────────┘
```

---

## Paralelización Permitida

| Fase | Agentes | Tareas |
|------|---------|--------|
| **2.1 Inicio** | jd-researcher + jd-architect + jd-planner | 2.1, 2.2, 2.3 simultáneo |
| **2.2 Backend** | jd-backend | 2.4, 2.5, 2.6 en paralelo (diferentes archivos) |
| **2.2 Frontend** | jd-frontend | 2.7, 2.8 en paralelo (diferentes archivos) |
| **2.3 Testing** | jd-qa | 2.9 → 2.10 → 2.11 secuencial |
| **2.4 Validación** | jd-security → jd-devil-advocate → jd-reviewer | Estrictamente secuencial |

---

## Criterios de Aceptación Global Fase 2

- [ ] **C1:** `/noticias` GET/POST funcional; `noticias.json` poblado desde Markdown (`content/noticias/*.md`); build script genera JSON en `npm run build` y CI; cron/commit actualiza
- [ ] **C2:** Meta tags dinámicos por sección; Open Graph completo; JSON-LD `Game`/`NewsArticle` válido; `sitemap.xml` en build; `robots.txt`
- [ ] **C3:** Filtros ARIA `tablist`/`tab`/`tabpanel`; `:focus-visible` en todos interactivos; `alt` semántico; contraste WCAG AA
- [ ] **C4:** Vitest worker PASS (cobertura ≥ 80%); Playwright E2E PASS (smoke + noticias + juegos); GitHub Actions test job en PR; preview deploy
- [ ] **C5:** CSP restrictivo sin romper frontend; `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin`; rate limit 10 req/min/IP en `/ingest` y `/games`
- [ ] **H3:** `/health` con checks KV, GitHub, fuentes; status 200/503; GitHub Issue auto en fallo
- [ ] **H6:** Rate limiting KV funcionando (429 con Retry-After)
- [ ] Tests: Unit + Integración + E2E = PASS
- [ ] Security: 0 CRITICAL, 0 HIGH sin mitigación
- [ ] Devil's Advocate: Pre-mortem aprobado, riesgos documentados
- [ ] Reviewer: Sign-off final

---

## Estimación de Esfuerzo

| Tarea | Horas | Agente |
|-------|-------|--------|
| 2.1 Research Noticias | 2h | jd-researcher |
| 2.2 Architecture | 3h | jd-architect |
| 2.3 Planning | 1h | jd-planner |
| 2.4 Worker /noticias | 4h | jd-backend |
| 2.5 Rate Limit + Headers | 3h | jd-backend |
| 2.6 Health Checks | 2h | jd-backend |
| 2.7 Frontend SEO | 4h | jd-frontend |
| 2.8 Frontend A11y | 3h | jd-frontend |
| 2.9 Vitest Worker | 4h | jd-qa |
| 2.10 Playwright E2E | 4h | jd-qa |
| 2.11 GH Actions Test | 2h | jd-qa |
| 2.12 Security Audit | 2h | jd-security |
| 2.13 Devil's Advocate | 2h | jd-devil-advocate |
| 2.14 Review | 1h | jd-reviewer |
| **Total** | **~37h** | |

---

## Riesgos y Mitigación (para Devil's Advocate)

| Riesgo | Probabilidad | Impacto | Mitigación en Plan |
|--------|--------------|---------|-------------------|
| WP RSS/JSON Feed bloqueado por challenge JS | Alta | Alto | Fallback a Markdown en repo (content/noticias/) |
| CSP rompe scripts inline en index.html | Media | Alto | `unsafe-inline` solo para scripts/styles existentes; migrar a archivos en v2 |
| Rate limiting KV false positives (shared IP) | Media | Medio | Ventana sliding + TTL; header `X-Forwarded-For` en CF |
| Health check false positive (fuente temporal down) | Media | Bajo | Threshold: 2/3 fuentes OK = degraded, no down |
| Playwright flaky en CI (timing) | Media | Medio | `waitForSelector`, timeouts generosos, retry 1x |
| Sitemap no incluye URLs dinámicas (SPA anchors) | Baja | Bajo | Incluir solo rutas estáticas; SPA maneja routing cliente |
| Noticias schema incompatible con frontend | Baja | Alto | Validar con jd-frontend antes de implementar |
| GitHub Issue spam si pipeline falla repetidamente | Baja | Medio | Cooldown 24h entre issues; label `pipeline` + deduplicación |

---

**Generado por jd-planner** — Listo para ejecución coordinada por jd-master