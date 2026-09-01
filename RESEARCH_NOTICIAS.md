# Investigación Fuentes Noticias - informegaming

**Fecha:** 2026-08-31  
**Agente:** jd-researcher  
**Contexto:** Fase 2 - C1 Fix Noticias

---

## Resultados de Pruebas

| Endpoint | Método | Resultado | Detalles |
|----------|--------|-----------|----------|
| `https://informegaming.gt.tc/feed/json` | GET | ❌ **Bloqueado** | Cloudflare challenge: SSL renegotiation + connection closed abruptly |
| `https://informegaming.gt.tc/wp-json/wp/v2/posts?_embed` | GET | ❌ **Bloqueado** | Cloudflare challenge: SSL renegotiation + connection closed abruptly |
| `https://informegaming.gt.tc/feed/` | GET | ❌ **Bloqueado** | Cloudflare challenge: SSL renegotiation + connection closed abruptly |

**Conclusión:** Todos los endpoints WordPress están protegidos por challenge JavaScript (Cloudflare Turnstile/Bot Management). Las peticiones directas (curl, fetch, worker) reciben página de challenge, no JSON/RSS.

---

## Estrategias Evaluadas

### Opción A: Proxy Edge Function (Worker) con bypass
- Worker fetchea con headers de navegador real
- **Riesgo:** Cloudflare detecta y bloquea IPs de Workers; frágil, requiere mantenimiento
- **Veredicto:** ❌ No recomendado

### Opción B: RSS/JSON Feed via servicio tercero (rss2json, etc.)
- Servicios como rss2json.com, rssapi.net convierten RSS a JSON
- **Riesgo:** Dependencia externa, rate limits, posible costo, latencia
- **Veredicto:** ⚠️ Solo si no hay alternativa

### Opción C: Markdown en Repo + Build-time Generation (RECOMENDADA)
- Archivos `content/noticias/*.md` con frontmatter
- Script build genera `public/data/noticias.json`
- Control total, versionado, gratis, sin dependencias externas
- **Veredicto:** ✅ **Estrategia principal para Fase 2**

### Opción D: Headless CMS gratuito (Contentful, Sanity, Netlify CMS)
- Panel admin para editores no técnicos
- **Riesgo:** Overkill para este proyecto, configuración adicional
- **Veredicto:** ❌ Para v2/v3

---

## Esquema NewsArticle Recomendado

Compatible con frontend actual (`noticias.js` espera: `title`, `excerpt`, `date`, `image`, `url`, `categories`):

```typescript
interface NewsArticle {
  id: string;                    // slug o hash
  title: string;
  excerpt: string;               // resumen corto (max 200 chars)
  content: string;               // contenido completo (Markdown/HTML)
  date: string;                  // ISO 8601
  image?: string;                // URL imagen destacada
  url: string;                   // enlace canónico (opcional, para SEO)
  categories: string[];          // ej: ['PC', 'PS', 'Xbox', 'Nintendo']
  tags: string[];                // ej: ['review', 'lanzamiento', 'gratis']
  author?: string;
  source: 'markdown';            // para debug
  raw: Record<string, unknown>;  // frontmatter original
}
```

---

## Estructura Archivos Markdown

```
content/
└── noticias/
    ├── 2026-08-30-epic-games-free-week.md
    ├── 2026-08-28-nuevo-dlc-gratis-steam.md
    └── ...
```

**Frontmatter ejemplo:**
```yaml
---
id: epic-games-free-week-aug-2026
title: "Epic Games regala 3 juegos esta semana"
excerpt: "Desde hoy hasta el jueves, puedes reclamar..."
date: "2026-08-30T10:00:00.000Z"
image: "https://cdn.epicgames.com/.../banner.jpg"
url: "https://store.epicgames.com/es-ES/free-games"
categories: ["PC", "Epic"]
tags: ["gratis", "epic-games", "semanal"]
author: "informegaming"
---
Contenido en Markdown...
```

---

## Pipeline Propuesto

1. **Escritores** crean/editan `.md` en `content/noticias/`
2. **Build script** (Node/tsx) procesa frontmatter + Markdown → `public/data/noticias.json`
3. **GitHub Actions** en push a `main` → build → deploy
4. **Worker `/noticias`** sirve desde KV (fallback) o GitHub raw (opcional)

---

## Decisión para Fase 2

**Implementar Opción C (Markdown en repo) como fuente principal.**

- Worker endpoint `/noticias` lee de KV `noticias.json` (poblado por build script)
- Build script: `scripts/build-noticias.ts` → ejecuta en `npm run build` y GitHub Actions
- Frente a futuro: si se migra WP a hosting sin challenge, se puede añadir source WP como secondary

---

## Próximos Pasos

1. **jd-architect:** Diseñar endpoint `/noticias`, build script, integración Worker + KV
2. **jd-planner:** Actualizar plan con tareas Markdown-based
3. **jd-backend:** Implementar endpoint + build script + KV write
4. **jd-frontend:** Adaptar `noticias.js` al nuevo schema (ya compatible)

---

**Firmado:** jd-researcher  
**Estado:** COMPLETED — Investigación finalizada, estrategia definida