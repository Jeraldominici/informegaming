# Plan de Implementación: informegaming

**Fuente:** ARCHITECTURE.md  
**Nivel de complejidad:** LEVEL 3 (Proyecto nuevo + arquitectura + pipeline completo)  
**Equipo requerido:** Completo (11 agentes)

---

## FASE 0: Fundación (1-2 días) — **jd-backend + jd-planner**

### Tarea 0.1: Inicializar proyecto Vite + Vanilla
- **Objeto:** Configurar tooling moderno sin reescribir lógica existente
- **Contexto:** Proyecto actual es vanilla JS sin build en `informegaming/`
- **Dependencias:** Ninguna
- **Archivos probables:**
  - `package.json` (nuevo)
  - `vite.config.js` (nuevo)
  - `index.html` (mover a raíz si no está)
  - `src/` (nueva estructura: mover `css/`, `js/` aquí)
- **Criterio de aceptación:**
  - `npm run dev` levanta dev server con HMR
  - `npm run build` genera `dist/` optimizado
  - Estructura: `index.html` en raíz, `src/js/`, `src/css/`, `public/data/juegos.json`
- **Validación:** `npm run dev` → abre en navegador → `npm run build` → verifica `dist/`

### Tarea 0.2: Placeholder de datos + GitHub Actions Deploy
- **Objeto:** Preparar pipeline CI/CD para deploy automático
- **Contexto:** Deploy target: Cloudflare Pages / Netlify / Vercel (gratis)
- **Dependencias:** Tarea 0.1 completada
- **Archivos probables:**
  - `public/data/juegos.json` (placeholder vacío: `{ "generatedAt": "", "version": "1.0", "games": [] }`)
  - `.github/workflows/deploy.yml` (nuevo)
- **Criterio de aceptación:**
  - Workflow hace `npm ci && npm run build`
  - Deploy automático a plataforma elegida en push a `main`
  - Build pasa sin errores
- **Validación:** Push a main → Actions verde → Sitio accesible en URL de deploy

---

## FASE 1: Data Pipeline - Epic + GamerPower (2-3 días) — **jd-backend + jd-researcher**

### Tarea 1.1: Cloudflare Worker Ingest (Epic + GamerPower)
- **Objeto:** Worker que fetchea, normaliza y guarda juegos gratis diarios
- **Contexto:** APIs validadas: Epic (Parse Bot wrapper), GamerPower (sin auth)
- **Dependencias:** Fase 0 completada
- **Archivos probables:**
  - `worker/ingest.ts` (nuevo)
  - `worker/types.ts` (nuevo - interface GameFree)
  - `worker/package.json` (nuevo)
  - `wrangler.toml` (nuevo - config Cloudflare)
- **Criterio de aceptación:**
  - `wrangler dev` levanta worker local
  - `curl localhost:8787/ingest` retorna JSON normalizado con juegos de Epic + GamerPower
  - Schema `GameFree` respetado (id, title, platform, storeUrl, imageUrl, startsAt, endsAt, isActive, type, source, raw)
  - Dedup por `id` (platform:title) funciona
- **Validación:** Test unitario de normalización + integración local

### Tarea 1.2: Cron Diario + GitHub Actions Sync
- **Objeto:** Automatizar ingest diaria y commit de datos al repo
- **Contexto:** Cron 6 AM UTC → Worker → KV → GitHub Action commit → Deploy
- **Dependencias:** Tarea 1.1
- **Archivos probables:**
  - `.github/workflows/sync-data.yml` (nuevo)
  - `wrangler.toml` (actualizar: cron trigger)
- **Criterio de aceptación:**
  - Cron trigger diario funciona
  - Worker escribe a KV `juegos.json`
  - GitHub Action lee KV o recibe webhook → commit `public/data/juegos.json` → push
  - Deploy se trigga automáticamente
- **Validación:** Disparar manualmente → ver commit en repo → ver deploy

---

## FASE 2: Data Pipeline - Steam + Xbox + PS (2-3 días) — **jd-backend**

### Tarea 2.1: Steam Free Games (Scraping / RSS)
- **Objeto:** Integrar fuente Steam (free weekends + free-to-keep)
- **Contexto:** SteamDB `/upcoming/free/` o gg.deals RSS
- **Dependencias:** Tarea 1.1 (worker base)
- **Archivos probables:** `worker/sources/steam.ts` (nuevo)
- **Criterio:** Fetch + parse → GameFree[] → integrar en pipeline

### Tarea 2.2: Xbox Free Play Days
- **Objeto:** Integrar Microsoft Store API (Free Play Days)
- **Contexto:** Endpoint público Reco API
- **Dependencias:** Tarea 1.1
- **Archivos probables:** `worker/sources/xbox.ts` (nuevo)

### Tarea 2.3: PlayStation Plus Monthly
- **Objeto:** Integrar PS+ mensual (GamerPower o scraping psplusinfo.com)
- **Contexto:** GamerPower soporta `platform=ps4,ps5`
- **Dependencias:** Tarea 1.1
- **Archivos probables:** `worker/sources/playstation.ts` (nuevo)

---

## FASE 3: Frontend Integration (1 día) — **jd-frontend**

### Tarea 3.1: Migrar `js/juegos.js` a Datos Estáticos
- **Objeto:** Consumir `public/data/juegos.json` en lugar de WordPress API
- **Contexto:** Vite resuelve `import` de JSON en build; fallback fetch en runtime
- **Dependencias:** Fase 0 + 1 (datos disponibles)
- **Archivos probables:** `src/js/juegos.js` (modificar)
- **Criterio de aceptación:**
  - `import juegosData from '../data/juegos.json'` funciona en build
  - Fallback `fetch('/data/juegos.json')` si import falla
  - Filtros por plataforma (Epic, Steam, Xbox, PS, Nintendo) funcionan
  - Countdown 30s usa `endsAt` correctamente
  - Historial muestra juegos `!isActive`
- **Validación:** `npm run dev` → verificar UI completa

### Tarea 3.2: Adaptar Noticias (RSS Fallback)
- **Objeto:** Migrar noticias a fuente accesible
- **Contexto:** Probar `/feed/json` o `/wp-json/wp/v2/posts`
- **Dependencias:** Fase 0
- **Archivos probables:** `src/js/noticias.js` (modificar), `public/data/noticias.json` (nuevo)

---

## FASE 4: Observabilidad + Polish (1 día) — **jd-qa + jd-devil-advocate + jd-security**

### Tarea 4.1: Health Checks + Alertas
- **Objeto:** Monitoring básico del pipeline
- **Archivos probables:** `worker/health.ts`, alertas GitHub Issue/Discord
- **Criterio:** Endpoint `/health` → 200 OK; alerta si `games.length === 0`

### Tarea 4.2: SEO + PWA + Accesibilidad
- **Objeto:** Meta tags, Open Graph, sitemap, manifest, service worker
- **Archivos probables:** `index.html` (meta), `public/manifest.json`, `public/sw.js`

---

## FLUJO DE DELEGACIÓN (Orden Obligatorio)

```
Fase 0:
  jd-planner (plan) → jd-backend (Vite + GitHub Actions) → jd-qa (verificar build)

Fase 1:
  jd-researcher (validar APIs) + jd-architect (worker design) → paralelo
  jd-backend (worker ingest + cron) → jd-qa (tests) → jd-security (secrets, CORS) → jd-devil-advocate → jd-reviewer

Fase 2:
  jd-backend (Steam + Xbox + PS sources) → jd-qa → jd-security → jd-devil-advocate → jd-reviewer

Fase 3:
  jd-frontend (juegos.js + noticias.js) → jd-qa → jd-devil-advocate → jd-reviewer

Fase 4:
  jd-qa (E2E) + jd-devil-advocate (pre-mortem) + jd-security (auditoría final) → jd-reviewer (sign-off)
```

---

## PARALELIZACIÓN PERMITIDA

- **Fase 1 inicio:** `jd-researcher` + `jd-architect` en paralelo
- **Fase 1 implementación:** Solo `jd-backend` (worker es unitario)
- **Fase 2:** `jd-backend` fuentes en paralelo (Steam, Xbox, PS independientes)
- **Fases 3-4:** Secuencial por dependencias de datos

---

## DEFINITION OF DONE GLOBAL

- [ ] Fase 0: Vite + Build + Deploy funcionando en producción
- [ ] Fase 1: Worker ingest Epic + GamerPower → datos diarios en repo → deploy automático
- [ ] Fase 2: 5 plataformas cubiertas (Epic, Steam, Xbox, PS, Nintendo via GamerPower)
- [ ] Fase 3: Frontend consume datos estáticos, filtros + countdown + historial funcionando
- [ ] Fase 4: Health checks, alertas, SEO, PWA básicos
- [ ] Tests: Unit (worker), Integración (pipeline), E2E (frontend)
- [ ] Seguridad: Sin secrets en repo, CORS correcto, rate limits manejados
- [ ] Devil's Advocate: Pre-mortem aprobado, riesgos mitigados
- [ ] Reviewer: Sign-off final

---

## RIESGOS IDENTIFICADOS (del ARCHITECTURE.md)

| Riesgo | Mitigación en Plan |
|--------|-------------------|
| Epic API cambia | Tests de contrato en CI; fallback a GamerPower |
| GamerPower rate limit | Cache 24h en KV; fuentes redundantes |
| Steam scraping frágil | Priorizar Epic + GamerPower; Steam como bonus |
| PS/Nintendo sin API oficial | Aceptar cobertura parcial; mostrar "Próximamente" |
| Worker limits | 100k req/día gratis → suficiente para 1 req/día |
| GitHub Actions no trigga deploy | Webhook + fallback manual documentado |

---

## PRÓXIMO PASO INMEDIATO

**Ejecutar Fase 0** con `jd-backend`:
1. `npm create vite@latest . -- --template vanilla`
2. Ajustar estructura (mover archivos a `src/`)
3. Configurar `vite.config.js`
4. Crear `public/data/juegos.json` placeholder
5. Crear `.github/workflows/deploy.yml`
6. Commit inicial + push → verificar deploy