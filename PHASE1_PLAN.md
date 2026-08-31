# Plan Detallado - Fase 1: Data Pipeline (Epic + GamerPower)

**Proyecto:** informegaming  
**Fase:** 1 - Data Pipeline  
**Complejidad:** LEVEL 2 (Feature media + nueva integración)  
**Equipo:** jd-planner + jd-researcher + jd-architect → jd-backend → jd-qa → jd-security → jd-devil-advocate → jd-reviewer  
**Fuentes:** ARCHITECTURE.md, plan.md  
**Contexto:** Fase 0 completada (Vite + CI/CD + placeholder `public/data/juegos.json`)

---

## Desglose de Tareas

### Tarea 1.1: Configuración Base del Worker (Cloudflare Workers + TypeScript)
- **Objetivo:** Estructura inicial del worker con types, config wrangler, package.json
- **Dependencias:** Ninguna (inicio paralelo)
- **Archivos a crear:**
  - `worker/package.json` - deps: wrangler, typescript, @cloudflare/workers-types
  - `worker/tsconfig.json` - configuración TypeScript estricta
  - `worker/wrangler.toml` - name, main, compatibility_date, cron trigger `0 6 * * *`, KV namespace binding
  - `worker/src/types.ts` - interface `GameFree` según ARCHITECTURE.md
  - `worker/src/env.d.ts` - tipos de bindings (KV, env vars)
- **Criterio de aceptación:**
  - `npm install` en `worker/` instala sin errores
  - `npx tsc --noEmit` pasa sin errores
  - `wrangler dev` levanta worker local en puerto 8787
  - Schema `GameFree` coincide exactamente con ARCHITECTURE.md (líneas 116-130)

### Tarea 1.2: Fuente Epic Games (Parse Bot / edsycarreon wrapper)
- **Objetivo:** Fetch + parse de juegos gratis semanales de Epic
- **Dependencias:** Tarea 1.1 (types, config base)
- **Archivos a crear:**
  - `worker/src/sources/epic.ts` - función `fetchEpicGames(env): Promise<GameFree[]>`
  - Incluir: endpoint, auth (API key opcional via env), parsing respuesta, mapeo a GameFree
  - Manejo errores: rate limit, API down, schema changes
- **Criterio de aceptación:**
  - Función retorna `GameFree[]` con `source: 'epic'`, `platform: 'Epic'`
  - Campos obligatorios: id, title, storeUrl, imageUrl, startsAt, endsAt, isActive, type
  - Test unitario: mock response → output válido
  - Log estructurado: count, latency, errors

### Tarea 1.3: Fuente GamerPower API
- **Objetivo:** Fetch + parse de giveaways multi-plataforma (sin auth)
- **Dependencias:** Tarea 1.1
- **Archivos a crear:**
  - `worker/src/sources/gamerpower.ts` - función `fetchGamerPower(env): Promise<GameFree[]>`
  - Endpoint: `https://www.gamerpower.com/api/giveaways`
  - Filtrado por plataforma en worker (Epic, Steam, Xbox, PS, Nintendo)
  - Mapeo: `platforms` array → platform principal, `type` según `giveaway_type`
- **Criterio de aceptación:**
  - Retorna `GameFree[]` con `source: 'gamerpower'`
  - Platforms mapeados correctamente: 'epic-games-store' → 'Epic', 'steam' → 'Steam', etc.
  - Deduplicación interna por id antes de retornar
  - Rate limit handling (retry con backoff)

### Tarea 1.4: Pipeline Core - Normalize + Dedup + Persist
- **Objetivo:** Orquestación completa: fetch paralelo → normalize → dedup → write KV
- **Dependencias:** Tareas 1.1, 1.2, 1.3
- **Archivos a crear/modificar:**
  - `worker/src/normalize.ts` - `normalizeToGameFree(raw, source): GameFree`
    - Computed `isActive`: `now >= startsAt && now <= endsAt`
    - Validación fechas ISO 8601, timezone UTC
    - Sanitización strings (trim, max length)
  - `worker/src/dedup.ts` - `deduplicate(games: GameFree[]): GameFree[]`
    - Key: `${platform}:${title.toLowerCase()}`
    - Keep newest by `startsAt` (más reciente primero)
    - Log de duplicados removidos
  - `worker/src/ingest.ts` - Entry point `scheduled(event, env, ctx)`
    - `Promise.allSettled([fetchEpic, fetchGamerPower])`
    - Merge results → normalize → dedup → sort by startsAt
    - `env.KV.put('juegos.json', JSON.stringify({ generatedAt, version: '1.0', games }))`
    - Trigger deploy via GitHub API (opcional, fase 1.5)
    - Structured logging: total fetched, normalized, deduped, persisted
- **Criterio de aceptación:**
  - `wrangler dev` + `curl localhost:8787/__scheduled` ejecuta pipeline completo
  - Output JSON válido en KV con estructura ARCHITECTURE.md líneas 268-290
  - 0 errores TypeScript, 0 warnings ESLint
  - Latencia total < 30s (free tier limits)

### Tarea 1.5: GitHub Actions - Sync Diario + Commit Automático
- **Objetivo:** Automatizar ingest diaria y commit de `public/data/juegos.json` al repo
- **Dependencias:** Tarea 1.4 (worker funcional)
- **Archivos a crear:**
  - `.github/workflows/ingest.yml`:
    - `on: schedule: cron: '0 6 * * *'` (6 AM UTC)
    - `workflow_dispatch` para trigger manual
    - Job: `wrangler deploy` → `wrangler kv:key put` → read KV → commit `public/data/juegos.json` → push
    - Permissions: `contents: write`, `id-token: write`
    - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GH_TOKEN` (o `GITHUB_TOKEN`)
- **Criterio de aceptación:**
  - `workflow_dispatch` ejecuta completo → commit visible en repo → deploy trigga
  - `public/data/juegos.json` actualizado con `generatedAt` fresco
  - GitHub Pages deploy automático tras commit
  - Logs Actions muestran: fetch count, dedup count, commit SHA

### Tarea 1.6: Tests Unitarios + Integración Local
- **Objetivo:** Validar normalización, edge cases, pipeline completo
- **Dependencias:** Tareas 1.2, 1.3, 1.4
- **Archivos a crear:**
  - `worker/src/__tests__/normalize.test.ts` - casos: fechas pasadas/futuras, zonas horarias, strings vacíos, tipos desconocidos
  - `worker/src/__tests__/dedup.test.ts` - duplicados exactos, mismo título distinta plataforma, distinta fuente
  - `worker/src/__tests__/sources/epic.test.ts` - mock fetch → GameFree[]
  - `worker/src/__tests__/sources/gamerpower.test.ts` - mock fetch → GameFree[]
  - `worker/src/__tests__/ingest.integration.test.ts` - `wrangler dev` + curl endpoint
- **Criterio de aceptación:**
  - `npm test` en `worker/` → 100% pass
  - Cobertura: normalize (100%), dedup (100%), sources (80%+)
  - Edge cases cubiertos: API down (fulfilled/rejected), empty response, malformed dates, duplicate titles

---

## Matriz de Dependencias

```
Tarea 1.1 (Base) ──────────────────────┐
                                        ├──▶ Tarea 1.4 (Pipeline Core)
Tarea 1.2 (Epic) ──────────────────────┤
                                        │
Tarea 1.3 (GamerPower) ────────────────┘
                                        │
                                        ▼
                                   Tarea 1.5 (GitHub Actions Sync)
                                        │
                                        ▼
                                   Tarea 1.6 (Tests)
```

---

## Paralelización Permitida

| Fase | Agentes | Tareas |
|------|---------|--------|
| **Research + Arch + Plan** | jd-researcher + jd-architect + jd-planner | Simultáneo (inicio) |
| **Implementación** | jd-backend | Secuencial: 1.1 → 1.2/1.3 (paralelo) → 1.4 → 1.5 → 1.6 |
| **Validación** | jd-qa → jd-security → jd-devil-advocate → jd-reviewer | Secuencial estricta |

---

## Criterios de Aceptación Global Fase 1

- [ ] Worker TypeScript compila sin errores (`tsc --noEmit`)
- [ ] `wrangler dev` levanta en localhost:8787
- [ ] `curl localhost:8787/__scheduled` retorna JSON con juegos Epic + GamerPower
- [ ] Schema `GameFree` respetado al 100%
- [ ] Dedup funciona: mismo juego en Epic y GamerPower → 1 entrada
- [ ] GitHub Action `ingest.yml` ejecuta y commitea `public/data/juegos.json`
- [ ] Tests unitarios + integración: PASS
- [ ] Sin secrets en código (API keys en env vars / Cloudflare secrets)
- [ ] Devil's Advocate: pre-mortem aprobado
- [ ] Reviewer: sign-off final

---

## Estimación de Esfuerzo

| Tarea | Horas | Agente |
|-------|-------|--------|
| 1.1 Base Worker | 2h | jd-backend |
| 1.2 Epic Source | 3h | jd-backend |
| 1.3 GamerPower Source | 2h | jd-backend |
| 1.4 Pipeline Core | 3h | jd-backend |
| 1.5 GitHub Actions | 2h | jd-backend |
| 1.6 Tests | 3h | jd-qa + jd-backend |
| **Total** | **~15h** | |

---

## Riesgos y Mitigación (para Devil's Advocate)

| Riesgo | Probabilidad | Impacto | Mitigación en Plan |
|--------|--------------|---------|-------------------|
| Epic API cambia schema | Media | Alto | Tests de contrato; fallback a GamerPower |
| GamerPower rate limit / down | Media | Medio | Retry + backoff; cache 24h en KV; fuentes redundantes |
| Cloudflare KV limits | Baja | Bajo | 1 write/día << 100k/day free tier |
| GitHub Actions no push | Baja | Medio | Verificar permissions; fallback manual documentado |
| Fechas timezone incorrectas | Media | Alto | Normalizar todo a UTC en `normalize.ts`; tests exhaustivos |
| Duplicados no detectados | Media | Medio | Key `platform:title` + test cases exhaustivos |

---

**Generado por jd-planner** — Listo para ejecución por jd-backend