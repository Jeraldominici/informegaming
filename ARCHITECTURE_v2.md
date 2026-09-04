# Architecture v2: informegaming - Expansión Profesional

## Contexto
**Proyecto base:** informegaming v1 (GitHub Pages + Cloudflare Worker + KV + GitHub Actions)
- Frontend: Vite + Vanilla JS → GitHub Pages
- Backend: Cloudflare Worker → KV + GitHub Actions commit
- Pipeline: Cron 6 AM UTC → GamerPower + Epic + Xbox → KV → GitHub Actions → Deploy

---

## ADR-001: Esquema Unificado GameFree v2

### Decisión
Extender `GameFree` con campo `availabilityType` para clasificar en 3 niveles.

### Schema TypeScript
```typescript
type AvailabilityType = 'today' | 'week' | 'always';
type AvailabilityWindow = {
  start: string;     // ISO 8601
  end: string;       // ISO 8601 (null para 'always')
  isActiveToday: boolean;  // computed: now >= start && now <= end
  isActiveThisWeek: boolean; // computed: now >= start && now <= end (7 días)
};

interface GameFree {
  id: string;
  title: string;
  platform: Platform;
  storeUrl: string;
  imageUrl: string;
  description?: string;
  startsAt: string;
  endsAt: string;           // null/lejos = 'always'
  isActive: boolean;
  availabilityType: AvailabilityType;  // NUEVO
  availabilityWindow?: AvailabilityWindow; // NUEVO
  type: GameType;
  source: Source;
  tags: string[];           // NUEVO: para búsqueda/filtros
  raw: Record<string, unknown>;
}
```

### Lógica de Clasificación
```typescript
function classifyAvailability(game: GameFree): AvailabilityType {
  const now = new Date();
  const start = new Date(game.startsAt);
  const end = game.endsAt ? new Date(game.endsAt) : null;

  if (!end || end.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return 'always'; // F2P permanente o fecha muy lejana
  }

  const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays <= 1 && start <= now && end >= now) return 'today';
  if (diffDays <= 7) return 'week';

  return 'week'; // fallback
}
```

---

## ADR-002: Nuevos Endpoints Worker v2

### Endpoints Nuevos
| Endpoint | Método | Parámetros | Descripción |
|----------|--------|------------|-------------|
| `/games` | GET | `type=today\|week\|always`, `platform=`, `q=` | Filtros combinados |
| `/search` | GET | `q=`, `platform=`, `type=` | Búsqueda fuzzy + filtros |
| `/games/always-free` | GET | `platform=` | Solo F2P permanentes |
| `/gta6` | GET | - | Sección GTA 6 completa |

### Parámetros Query
```
GET /games?type=today|week|always&platform=Epic|Steam|Xbox|PS|Nintendo&q=texto
GET /search?q=gta&platform=Epic&type=week
GET /gta6
```

### Response Format
```typescript
interface GamesResponse {
  generatedAt: string;
  version: string;
  games: GameFree[];
  filters: {
    types: AvailabilityType[];
    platforms: Platform[];
    total: number;
    filtered: number;
  };
}

interface GTA6Response {
  generatedAt: string;
  version: string;
  noticias: NewsArticle[];
  videos: GTA6Video[];
  timeline: TimelineEvent[];
  releaseDate?: string;
  spoilersEnabled: boolean;
}
```

---

## ADR-003: Fuentes "Always Free" (F2P Permanentes)

| Fuente | API/Endpoint | Auth | Rate Limit | Juegos Esperados |
|--------|--------------|------|------------|------------------|
| **Steam F2P** | `store.steampowered.com/api/featuredcategories?category=free_to_play` | No | ~100 req/min | 500+ |
| **Epic F2P** | GraphQL `catalog/offers?filter=free` | No (wrapper) | 200/mes (Parse.bot) | 50+ |
| **GOG Free** | `gog.com/games/ajax/filtered?mediaType=game&price=free` | No | - | 20+ |
| **itch.io** | `itch.io/games/free.json` | No | - | 1000+ |
| **Battle.net** | No API pública → scraping | - | - | 10+ (Hearthstone, OW2, etc.) |
| **EA App** | No API → scraping | - | - | 5+ |
| **Ubisoft Connect** | No API → scraping | - | - | 5+ |
| **Amazon Prime** | RSS/JSON feed | No | - | Rotativos |

### Prioridad Implementación
1. **Steam F2P** (mayor catálogo, API accesible)
2. **Epic F2P** (ya tenemos wrapper Parse.bot)
3. **GOG Free** (API simple)
4. **itch.io** (JSON directo)
5. **Resto** (scraping → fase posterior)

---

## ADR-004: Sección GTA 6 - Arquitectura

### Componentes
| Componente | Fuente | Frecuencia | Storage |
|------------|--------|------------|---------|
| **Noticias GTA 6** | Worker fetch (RSS/JSON Feed WP + GamerPower filtrado) | Diario (cron) | KV `gta6.json` |
| **Videos** | YouTube Data API v3 (`search: "GTA 6 trailer"`) | Semanal (cron) | KV `gta6.json` |
| **Timeline** | Curado manual (Markdown) + auto de noticias | Build time | `content/gta6/timeline.md` |
| **Spoilers** | Toggle localStorage (cliente) | - | localStorage |

### GTA6Video Schema
```typescript
interface GTA6Video {
  id: string;           // videoId YouTube
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  url: string;          // youtube.com/watch?v=
  embedUrl: string;     // youtube.com/embed/
  type: 'trailer' | 'gameplay' | 'analysis' | 'leak' | 'news';
  isSpoiler: boolean;
}
```

### TimelineEvent Schema
```typescript
interface TimelineEvent {
  date: string;         // ISO 8601
  type: 'announcement' | 'trailer' | 'leak' | 'rumor' | 'release';
  title: string;
  description: string;
  source: string;
  sourceUrl?: string;
  isConfirmed: boolean;
}
```

---

## ADR-005: Frontend v2 - Arquitectura

### Routing (Hash-based)
```
#/                    → Home (Hero + Resumen)
#/hoy                 → Juegos Gratis Hoy
#/semana              → Juegos Gratis Esta Semana
#/siempre             → Juegos Gratis Siempre (F2P)
#/gta6                → Sección GTA 6
#/juego/:id           → Detalle juego (opcional v2.1)
```

### Componentes Reutilizables
| Componente | Props | Responsabilidad |
|------------|-------|-----------------|
| `GameGrid` | `games`, `onFilterChange` | Render grid + loading/empty |
| `GameCard` | `game`, `variant: 'default'|'compact'` | Card individual |
| `GameSearch` | `onSearch(q)`, `suggestions` | Input + debounce + autocomplete |
| `FilterChips` | `filters`, `onChange` | Chips filtros: tipo + plataforma |
| `VideoPlayer` | `video: GTA6Video` | Embed responsivo + spoiler toggle |
| `Timeline` | `events: TimelineEvent[]` | Vertical timeline |

### State Management
- **URL como Source of Truth:** `?type=week&platform=Epic&q=gta`
- **Sync bidireccional:** URL ↔ State (filtros, búsqueda, paginación)
- **localStorage:** Spoilers GTA 6, favoritos, preferencias UI

---

## ADR-006: Data Pipeline v2 - Actualización

### Worker Sources Nuevos
```typescript
// worker/src/sources/alwaysFree.ts
async function fetchAlwaysFree(env: Env): Promise<GameFree[]> {
  const results = await Promise.allSettled([
    fetchSteamF2P(env),
    fetchEpicF2P(env),
    fetchGOGFree(env),
    fetchItchioFree(env),
  ]);
  // merge + dedup + classify
}
```

### Cron Jobs Actualizados
| Job | Schedule | Descripción |
|-----|----------|-------------|
| **Ingest Juegos** | `0 6 * * *` | Diario 6 AM UTC (existente) |
| **GTA 6 Videos** | `0 7 * * 1` | Lunes 7 AM UTC (semanal) |
| **GTA 6 Noticias** | Incluido en ingest diario | - |
| **Always Free** | Incluido en ingest diario | - |

---

## ADR-007: Búsqueda Avanzada - Algoritmo

### Fuzzy Search (Cliente + Servidor)
```typescript
// Cliente: Fuse.js para autocomplete instantáneo
// Servidor: PostgreSQL trigram / Meilisearch / Typesense (futuro)
// Actual: Filtro cliente + fuzzy simple

function fuzzyMatch(query: string, game: GameFree): number {
  const haystack = `${game.title} ${game.platform} ${game.tags.join(' ')}`.toLowerCase();
  const needle = query.toLowerCase();
  
  // Exact match > starts with > contains > fuzzy
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 90;
  if (haystack.includes(needle)) return 80;
  
  // Levenshtein simple para typos
  return levenshteinScore(haystack, needle);
}
```

### Autocomplete
- Índice en cliente: `title + platform + tags` → array de sugerencias
- Debounce 150ms
- Máx 10 sugerencias
- Highlight match

---

## ADR-008: PWA - Service Worker

### Workbox Config
```javascript
// sw.js generado por Workbox
const CACHE_NAME = 'informegaming-v2';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];
const CACHE_STRATEGIES = {
  '/data/juegos.json': 'staleWhileRevalidate',
  '/data/noticias.json': 'staleWhileRevalidate',
  '/data/gta6.json': 'staleWhileRevalidate',
  '/api/*': 'networkFirst',
  '*.png, *.jpg, *.webp': 'cacheFirst',
};
```

### Offline Features
- Cache de últimos juegos/noticias/GTA6
- Página offline amigable
- Background sync para favoritos
- Install prompt nativo

---

## ADR-009: Feeds RSS/Atom + Newsletter

### Feeds Generados (Build Time)
| Feed | URL | Contenido |
|------|-----|-----------|
| **General** | `/feed.xml` | Todas las noticias + juegos |
| **Juegos Hoy** | `/feed/hoy.xml` | `type=today` |
| **Juegos Semana** | `/feed/semana.xml` | `type=week` |
| **GTA 6** | `/feed/gta6.xml` | Noticias + videos GTA 6 |

### Newsletter
- **Proveedor:** Buttondown / ConvertKit / MailerLite (free tier)
- **Signup:** Formulario en footer + modal exit-intent
- **Frecuencia:** Semanal (viernes) - resumen semana
- **Contenido:** Top 5 juegos gratis + noticia destacada + GTA 6 update

---

## ADR-010: Analytics + Métricas

### Proveedor: Plausible / Umami (Self-hosted free)
| Evento | Propiedades |
|--------|-------------|
| `game_view` | `game_id`, `platform`, `availability_type` |
| `game_claim_click` | `game_id`, `store_url` |
| `search` | `query`, `results_count`, `filters` |
| `gta6_video_play` | `video_id`, `video_type` |
| `spoiler_toggle` | `enabled` |
| `newsletter_signup` | `source` |

### Dashboards
- Juegos más vistos / clickeados
- Búsquedas populares (términos vacíos → oportunidades)
- Engagement GTA 6 (videos vs noticias)

---

## Plan de Migración Backward-Compatible

### Fase 1: Worker v2 (Paralelo a v1)
- Deploy Worker v2 en subdominio `v2.informegaming-ingest...`
- Mantener `/games` v1 funcional
- Test exhaustivo con datos reales

### Fase 2: Frontend v2 (Feature Flag)
- Nueva navegación oculta tras `?v2=true`
- Test A/B con usuarios beta
- Feedback → ajustes

### Fase 3: Cutover
- Switch DNS / GitHub Pages a v2
- Monitor 48h → rollback si issues

---

## Riesgos y Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Steam F2P API cambia | Media | Alto | Wrapper con tests contrato; fallback GamerPower |
| YouTube API quota | Alta | Medio | Cache 24h; fallback a videos curados manuales |
| Datos "always free" duplicados | Alta | Medio | Dedup robusto por `title+platform`; tags para distinguir |
| Breaking changes frontend | Baja | Alto | Feature flags; rollback instantáneo |
| Rate limits Worker | Baja | Medio | KV-backed rate limiting; headers `Retry-After` |

---

## Próximos Pasos (Fase 3 Implementation)

1. **Worker v2** → Nuevos sources + endpoints + GTA 6
2. **Frontend v2** → Routing + componentes + búsqueda
3. **GTA 6 Content** → Markdown timeline + YouTube fetcher
4. **Tests** → Playwright e2e + Vitest unit
5. **Deploy Staging** → Validación → Producción

---

*Documento: ARCHITECTURE_v2.md — Versión 2.0 — Generado para implementación Fase 3*