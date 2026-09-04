# Research Report: Fase 3 - Expansión Profesional informegaming

**Generado por:** jd-researcher (simulado por jd-master)  
**Fecha:** 2026-09-01  
**Objetivo:** Investigar fuentes técnicas para nuevos requerimientos

---

## 1. Fuentes de Juegos "Always Free" (Free-to-Play Permanentes)

### 1.1 Epic Games Store - Free-to-Play Catalog
| Aspecto | Detalle |
|---------|---------|
| **Endpoint** | `https://api.parse.bot/scraper/af5648f3-99a5-49a7-a148-2369345fc030/get_free_games` (ya usado) |
| **Alternativa** | GraphQL público: `https://graphql.epicgames.com/graphql` |
| **Query F2P** | `Catalog { searchStore(query: "free", categories: ["freegames"]) }` |
| **Autenticación** | Parse.bot: API Key (200 calls/mes free). GraphQL: Público sin auth |
| **Campos clave** | `title`, `description`, `keyImages[]`, `productSlug`, `price.totalPrice.discountPrice` (0 = free) |
| **Limitaciones** | Parse.bot solo juegos gratis *temporales*. GraphQL requiere parsing complejo |
| **Viabilidad** | ✅ Alta - Usar GraphQL para F2P permanentes, Parse.bot para rotación semanal |

### 1.2 Steam - Free-to-Play
| Aspecto | Detalle |
|---------|---------|
| **Endpoint oficial** | `https://store.steampowered.com/api/featuredcategories/?cc=us&l=en` |
| **Endpoint alternativo** | Steam Web API: `GetAppList` + `GetAppDetails` (requiere API Key) |
| **F2P detection** | `price_overview.final === 0` + `is_free === true` en GetAppDetails |
| **API Key** | Requerida para GetAppDetails (gratis, registrar en steamcommunity.com/dev/apikey) |
| **Rate limit** | 200,000 calls/día (generoso) |
| **Campos clave** | `name`, `short_description`, `header_image`, `platforms`, `release_date`, `genres` |
| **Viabilidad** | ✅ Alta - API oficial robusta, buena cobertura F2P |

### 1.3 itch.io
| Aspecto | Detalle |
|---------|---------|
| **Endpoint** | `https://itch.io/games/free.json` (página 1) |
| **Paginación** | `?page=1`, `?page=2`, etc. |
| **Campos** | `title`, `short_text`, `cover_url`, `url`, `platforms`, `classification` |
| **Rate limit** | No documentado, ~60 req/min razonable |
| **CORS** | ✅ Permitido |
| **Viabilidad** | ✅ Media - Buena para indie, datos menos estructurados |

### 1.4 GOG
| Aspecto | Detalle |
|---------|---------|
| **Endpoint** | `https://api.gog.com/v1/games/free` (no oficial) |
| **Alternativa** | Scraping `https://www.gog.com/games?price=free` |
| **Autenticación** | Ninguna (público) |
| **Viabilidad** | ⚠️ Baja - Sin API oficial estable, scraping frágil |

### 1.5 Battle.net / Blizzard
| Aspecto | Detalle |
|---------|---------|
| **Juegos F2P** | Hearthstone, Overwatch 2, WoW (hasta nivel 20), Diablo Immortal |
| **API** | No hay API pública de catálogo |
| **Viabilidad** | ❌ Baja - Lista estática conocida, hardcodear 4-5 títulos |

### 1.6 EA App / Origin
| Aspecto | Detalle |
|---------|---------|
| **Juegos F2P** | Apex Legends, EA Sports FC Online, etc. |
| **API** | No pública |
| **Viabilidad** | ❌ Baja - Hardcodear conocidos |

### 1.7 Amazon Prime Gaming
| Aspecto | Detalle |
|---------|---------|
| **Endpoint** | `https://gaming.amazon.com/api/v1/claims` (requiere auth) |
| **Viabilidad** | ❌ Requiere login usuario - no aplicable para catálogo público |

### 1.8 Xbox Game Pass / Microsoft Store
| Aspecto | Detalle |
|---------|---------|
| **F2P permanentes** | Fortnite, Warframe, Apex, Rocket League, etc. (ya en Xbox Free Play Days endpoint) |
| **Endpoint** | `https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/api/list/collection/FreePlayDays` |
| **Viabilidad** | ✅ Ya integrado - filtrar `type: 'permanent'` |

---

## 2. YouTube Data API v3 - Videos GTA 6

| Aspecto | Detalle |
|---------|---------|
| **Base URL** | `https://www.googleapis.com/youtube/v3/` |
| **Endpoints clave** | |
| `search.list` | Búsqueda: `q=GTA 6 OR "Grand Theft Auto VI"`, `type=video`, `order=date` |
| `videos.list` | Detalles: `id=VIDEO_ID`, `part=snippet,contentDetails,statistics` |
| `channels.list` | Canales oficiales: RockstarGames, IGN, GameSpot, etc. |
| **Autenticación** | API Key (Google Cloud Console) |
| **Cuota diaria** | 10,000 unidades/día (search: 100, videos: 1) |
| **Filtros recomendados** | `publishedAfter=2022-01-01T00:00:00Z`, `relevanceLanguage=es` |
| **Canales objetivo** | RockstarGames (UC0v-tlzsn0QZwJnkiaUSJBA), IGN, GameSpot, Eurogamer, Arekkz, GTA Series Videos |
| **Ejemplo respuesta search** |
```json
{
  "items": [{
    "id": { "videoId": "dQw4w9WgXcQ" },
    "snippet": {
      "title": "GTA 6 Official Trailer 1",
      "description": "...",
      "publishedAt": "2023-12-05T14:00:00Z",
      "channelTitle": "Rockstar Games",
      "thumbnails": { "maxres": { "url": "..." } }
    }
  }]
}
```
| **Viabilidad** | ✅ Alta - Cuota suficiente para ~50 búsquedas/día + cache 1h |

---

## 3. Twitch Helix API - Clips/Streams GTA 6

| Aspecto | Detalle |
|---------|---------|
| **Base URL** | `https://api.twitch.tv/helix/` |
| **Endpoints** | |
| `GET /search/channels?query=GTA 6` | Canales relevantes |
| `GET /videos?game_id=GTA6_GAME_ID&period=week` | Videos recientes (requiere game_id) |
| `GET /clips?game_id=...&started_at=...` | Clips |
| `GET /streams?game_id=...` | Streams en vivo |
| **Autenticación** | Client Credentials Flow (Client ID + Secret) |
| **App registration** | `https://dev.twitch.tv/console/apps` |
| **Rate limits** | 800 req/min (App access token) |
| **Game ID GTA 6** | No existe aún (juego no lanzado). Usar `Grand Theft Auto V` (33214) para contenido relacionado |
| **Viabilidad** | ⚠️ Media - Game ID no disponible hasta lanzamiento. Usar búsqueda por título en clips/videos |

---

## 4. Estrategias Fuzzy Search para Nombres de Juegos

### 4.1 Algoritmos
| Algoritmo | Uso | Complejidad |
|-----------|-----|-------------|
| **Levenshtein distance** | Coincidencia exacta aproximada | O(n*m) |
| **Jaro-Winkler** | Prefijos comunes (mejor para nombres) | O(n*m) |
| **Trigram/NGram** | Indexación para autocomplete | O(n) búsqueda |
| **Fuse.js** | Librería JS lista para producción | ~15KB gzipped |

### 4.2 Implementación Recomendada
**Backend (Worker):**
- Índice en memoria (KV o Durable Object) con trigramas
- Endpoint `/search/autocomplete?q=gt` → `["GTA 5", "GTA 6", "GTA V"]`

**Frontend:**
- **Fuse.js** para búsqueda instantánea client-side
- Debounce 300ms
- Mostrar hasta 10 sugerencias

### 4.3 Datasets para Indexar
- Todos los `title` de `juegos.json` (actual + histórico)
- Títulos de noticias (para búsqueda cruzada)
- Lista curada de juegos F2P conocidos (~200 títulos)

---

## 5. Resumen de Viabilidad y Decisiones

| Feature | Viabilidad | Acción |
|---------|------------|--------|
| Epic F2P (GraphQL) | ✅ Alta | Implementar source nuevo `epic-f2p.ts` |
| Steam F2P (Web API) | ✅ Alta | Implementar source `steam-f2p.ts` (req API Key) |
| itch.io F2P | ✅ Media | Implementar `itch.ts` (opcional, fase posterior) |
| GOG/Battle.net/EA | ❌ Baja | Hardcodear lista conocida (~15 juegos) |
| YouTube GTA 6 | ✅ Alta | Nuevo endpoint `/gta6/videos` + source `youtube.ts` |
| Twitch GTA 6 | ⚠️ Media | Opcional - solo clips si game_id disponible |
| Fuzzy Search | ✅ Alta | Fuse.js frontend + endpoint `/search/autocomplete` |
| 3 Tiers (hoy/semana/siempre) | ✅ Alta | Campo `availabilityType` en schema |

---

## 6. Recomendaciones de Implementación

1. **Fase 3.1 (Backend Core):**
   - Extender `GameFree` con `availabilityType: 'limited' | 'permanent'`
   - Agregar `source: 'steam' | 'epic-f2p' | 'itch' | 'hardcoded'`
   - Nuevo endpoint `/games?type=today|week|always&platform=&q=`
   - Sources: `steam-f2p.ts`, `epic-f2p.ts`, `hardcoded-f2p.ts`

2. **Fase 3.2 (GTA 6):**
   - Source `youtube.ts` con cache KV 1h
   - Endpoint `/gta6` → `{ noticias, videos, timeline, launchDate? }`
   - Spoilers: campo `isSpoiler: boolean` en noticias/videos

3. **Fase 3.3 (Search):**
   - Endpoint `/search?q=&type=&platform=` (backend)
   - Endpoint `/search/autocomplete?q=` (trigram index)
   - Frontend: Fuse.js + debounce

4. **Fase 3.4 (PWA/Analytics/RSS):**
   - Service Worker: Workbox (Vite plugin)
   - Analytics: Umami (self-hosted, privacy-friendly)
   - RSS: Generar XML en build para `/games`, `/noticias`, `/gta6`
   - Newsletter: Buttondown.email (API simple, free tier)

---

## 7. Referencias y Enlaces

- [Epic GraphQL Explorer](https://graphql.epicgames.com/graphql)
- [Steam Web API Docs](https://partner.steamgames.com/doc/webapi)
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [Twitch Helix API](https://dev.twitch.tv/docs/api/)
- [Fuse.js](https://fusejs.io/)
- [Workbox PWA](https://developer.chrome.com/docs/workbox/)
- [Umami Analytics](https://umami.is/)
- [Buttondown.email API](https://buttondown.email/api)