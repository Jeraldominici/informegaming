/**
 * Main Cloudflare Worker for informegaming v2
 * - Daily game data ingestion (Epic, GamerPower, Xbox, Steam F2P, Epic F2P, GOG, itch.io)
 * - GTA 6 section (noticias, videos, timeline)
 * - Noticias endpoint (Markdown-based, KV-backed)
 * - Health checks with dependency verification
 * - Rate limiting (KV-backed sliding window)
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - CORS restrictive
 */

// Standalone levenshtein function to avoid TypeScript narrowing issues in nested functions
function levenshteinDistance(a: string, b: string): number {
  const aStr: string = a;
  const bStr: string = b;
  const lenA = aStr.length;
  const lenB = bStr.length;
  // Create matrix with explicit dimensions
  const matrix: number[][] = new Array(lenB + 1).fill(0).map(() => new Array(lenA + 1).fill(0));
  for (let i = 0; i <= lenA; i++) matrix[0][i] = i;
  for (let j = 0; j <= lenB; j++) matrix[j][0] = j;
  for (let j = 1; j <= lenB; j++) {
    for (let i = 1; i <= lenA; i++) {
      const cost = aStr[i - 1] === bStr[j - 1] ? 0 : 1;
      const val1 = matrix[j][i - 1] + 1;
      const val2 = matrix[j - 1][i] + 1;
      const val3 = matrix[j - 1][i - 1] + (aStr[i - 1] === bStr[j - 1] ? 0 : 1);
      matrix[j][i] = Math.min(val1, val2, val3);
}
  return matrix[lenB][lenA];
}

import { Router } from 'itty-router';
import type { 
  Env, 
  IngestOutput, 
  GameFree, 
  NewsOutput, 
  HealthOutput,
  GamesResponse,
  SearchResponse,
  GTA6Output,
  GamesQueryParams,
  SearchQueryParams,
  GTA6Output as GTA6OutputType,
  TimelineEvent,
  TimelineEventType,
  GTA6Video,
} from './types';
import { fetchGamerPower } from './sources/gamerpower';
import { fetchEpicGames } from './sources/epic';
import { fetchXboxFreePlayDays } from './sources/xbox';
import { fetchSteamF2P } from './sources/steamF2P';
import { fetchEpicF2P } from './sources/epicF2P';
import { fetchGOGFree } from './sources/gogFree';
import { fetchItchioFree } from './sources/itchioFree';
import { fetchGTA6Videos } from './sources/gta6Videos';
import { fetchGTA6News } from './sources/gta6News';
import { handleGetNoticias, handlePostNoticias } from './sources/noticias';
import { deduplicateGames, classifyAvailability } from './utils/normalize';
import { checkRateLimit, addRateLimitHeaders, RATE_LIMIT_CONFIGS } from './middleware/rateLimit';
import { 
  applySecurityHeaders, 
  handleCORSPreflight, 
  getCORSHeaders,
  CSP_POLICY 
} from './middleware/securityHeaders';
import { runHealthChecks, getHealthStatusCode } from './health';

const router = Router<Request, [Env, ExecutionContext]>();

// ============================================
// MIDDLEWARE: Security Headers + CORS
// ============================================

// Handle OPTIONS preflight globally
router.options('*', (request) => handleCORSPreflight(request));

// Apply security headers to all responses
const withSecurity = (response: Response, request: Request) => 
  applySecurityHeaders(response, request);

// ============================================
// MIDDLEWARE: Rate Limiting
// ============================================

async function withRateLimit(request: Request, env: Env, next: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  const config = RATE_LIMIT_CONFIGS[url.pathname] || {};
  
  const rateLimitResponse = await checkRateLimit(request, env, config);
  if (rateLimitResponse) {
    return applySecurityHeaders(rateLimitResponse, request);
  }
  
  const response = await next();
  return addRateLimitHeaders(response, request, env, config);
}

// ============================================
// ROUTES: Games v2
// ============================================

// GET /games - Filtros combinados: type=today|week|always, platform=, q=
router.get('/games', async (request, env) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') as 'today' | 'week' | 'always' | null;
  const platform = url.searchParams.get('platform') as string | null;
  const q = url.searchParams.get('q') || '';
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  
  const data = await env.KV_NAMESPACE.get('juegos.json', 'json') as { games: GameFree[] } | null;
  
  let games: GameFree[] = data?.games || [];
  
  // Filtrar por tipo de disponibilidad
  if (type) {
    games = games.filter(g => g.availabilityType === type);
  }
  
  // Filtrar por plataforma
  if (platform) {
    games = games.filter(g => g.platform.toLowerCase() === platform.toLowerCase());
  }
  
  // Filtrar por búsqueda de texto
  if (q) {
    const query = q.toLowerCase();
    games = games.filter(g => 
      g.title.toLowerCase().includes(query) ||
      g.platform.toLowerCase().includes(query) ||
      g.tags.some(t => t.toLowerCase().includes(query)) ||
      (g.description || '').toLowerCase().includes(query)
    );
  }
  
  // Paginación
  const total = games.length;
  const filtered = games.slice(offset, offset + limit);
  
  const response: GamesResponse = {
    generatedAt: new Date().toISOString(),
    version: '2.0',
    games: filtered,
    filters: {
      types: ['today', 'week', 'always'],
      platforms: [...new Set(games.map(g => g.platform))],
      total,
      filtered: filtered.length,
    },
  };
  
  const response2 = new Response(JSON.stringify(response, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response2, request);
});

// GET /search - Búsqueda fuzzy con filtros
router.get('/search', async (request, env) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const platform = url.searchParams.get('platform') as string | null;
  const type = url.searchParams.get('type') as 'today' | 'week' | 'always' | null;
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  
  if (!q || q.length < 2) {
    const response = new Response(JSON.stringify({ 
      generatedAt: new Date().toISOString(),
      query: q,
      results: [],
      total: 0,
      suggestions: [],
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
    return withSecurity(response, request);
  }
  
  const data = await env.KV_NAMESPACE.get('juegos.json', 'json') as { games: GameFree[] } | null;
  const games: GameFree[] = data?.games || [];
  
  let filtered: GameFree[] = games.filter(g => g !== undefined && g !== null);
  
  if (platform) {
    filtered = filtered.filter(g => g.platform.toLowerCase() === platform.toLowerCase());
  }
  if (type) {
    filtered = filtered.filter(g => g.availabilityType === type);
  }
  
  // Fuzzy search simple
  const query = q.toLowerCase();
  // Fuzzy search simple - using for loop to avoid TypeScript narrowing issues
  const results: Array<{ game: GameFree; score: number; matchedFields: string[] }> = [];
  
  for (const game of filtered) {
    let score = 0;
    const matchedFields: string[] = [];
    
    const titleLower = game.title.toLowerCase();
    const descLower = (game.description ?? '').toLowerCase();
    const tagsLower = game.tags.join(' ').toLowerCase();
    const queryLower = q.toLowerCase();
    
    // Exact match
    if (titleLower === queryLower) { score += 100; matchedFields.push('title'); }
    else if (titleLower.startsWith(queryLower)) { score += 80; matchedFields.push('title'); }
    else if (titleLower.includes(queryLower)) { score += 60; matchedFields.push('title'); }
    
    if (descLower.includes(queryLower)) { score += 30; matchedFields.push('description'); }
    if (tagsLower.includes(queryLower)) { score += 20; matchedFields.push('tags'); }
    
    // Fuzzy simple para typos
    if (score === 0) {
      const dist = levenshteinDistance(titleLower, queryLower);
      if (dist <= 2) { score += 40 - dist * 10; matchedFields.push('fuzzy'); }
    }
    
    if (score > 0) {
      results.push({ game, score, matchedFields });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  const limitedResults = results.slice(0, limit);
  
  // Generar sugerencias
  const suggestions = [...new Set(
    games
      .map(g => g.title)
      .filter(t => t.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
  )];
  
  const response = {
    generatedAt: new Date().toISOString(),
    query: q,
    results: results.map(r => ({ game: r.game, score: r.score, matchedFields: r.matchedFields })),
    total: results.length,
    suggestions,
  };
  
  const response2 = new Response(JSON.stringify(response, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response2, request);
});

// GET /games/always-free - Solo juegos F2P permanentes
router.get('/games/always-free', async (request, env) => {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') as string | null;
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  
  const data = await env.KV_NAMESPACE.get('juegos.json', 'json') as { games: GameFree[] } | null;
  let games: GameFree[] = data?.games || [];
  
  games = games.filter(g => g.availabilityType === 'always');
  
  if (platform) {
    games = games.filter(g => g.platform.toLowerCase() === platform.toLowerCase());
  }
  
  const response = {
    generatedAt: new Date().toISOString(),
    version: '2.0',
    games: games.slice(0, limit),
    filters: {
      types: ['always'],
      platforms: [...new Set(games.map(g => g.platform))],
      total: games.length,
      filtered: Math.min(games.length, limit),
    },
  };
  
  const response2 = new Response(JSON.stringify(response, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response2, request);
});

// ============================================
// ROUTES: GTA 6 Section
// ============================================

// GET /gta6 - Sección completa GTA 6
router.get('/gta6', async (request, env) => {
  // Intentar leer de KV primero
  let gta6Data = await env.KV_NAMESPACE.get('gta6.json', 'json') as GTA6Output | null;
  
  if (!gta6Data || !gta6Data.noticias?.length) {
    // Reconstruir si no existe o está vacío
    const [noticias, videos, timeline] = await Promise.allSettled([
      fetchGTA6News(env),
      fetchGTA6Videos(env),
      fetchGTA6Timeline(env),
    ]);
    
    const noticiasData = noticias.status === 'fulfilled' ? noticias.value : [];
    const videosData = videos.status === 'fulfilled' ? videos.value : [];
    const timelineData = timeline.status === 'fulfilled' ? timeline.value : [];
    
    gta6Data = {
      generatedAt: new Date().toISOString(),
      version: '2.0',
      noticias: noticiasData,
      videos: videosData,
      timeline: timelineData,
      releaseDate: '2025',
      spoilersEnabled: false,
    };
    
    // Guardar en KV
    try {
      await env.KV_NAMESPACE.put('gta6.json', JSON.stringify(gta6Data));
    } catch (e) {
      console.error('[GTA6] Failed to write KV:', e);
    }
  }
  
  // Filtrar spoilers si no están habilitados (se hace en cliente via localStorage)
  const response: GTA6OutputType = {
    ...gta6Data!,
    spoilersEnabled: false, // Cliente maneja esto con localStorage
  };
  
  const response2 = new Response(JSON.stringify(response, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response2, request);
});

// POST /gta6/videos - Trigger manual fetch videos (para cron semanal)
router.post('/gta6/videos', async (request, env) => {
  const videos = await fetchGTA6Videos(env);
  
  // Actualizar KV
  const existing = await env.KV_NAMESPACE.get('gta6.json', 'json') as GTA6Output | null;
  const updated = {
    generatedAt: new Date().toISOString(),
    version: '2.0',
    noticias: existing?.noticias || [],
    videos,
    timeline: existing?.timeline || [],
    releaseDate: '2025',
    spoilersEnabled: false,
  };
  
  await env.KV_NAMESPACE.put('gta6.json', JSON.stringify(updated));
  
  const response = new Response(JSON.stringify({ 
    generatedAt: new Date().toISOString(),
    videosCount: videos.length,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response, request);
});

// Helper: fetch GTA 6 timeline from Markdown
async function fetchGTA6Timeline(env: Env): Promise<TimelineEvent[]> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return [];
  
  try {
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/content/gta6`, {
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    if (!response.ok) return [];
    
    const files = await response.json<Array<{ name: string; download_url: string }>>();
    const timeline: TimelineEvent[] = [];
    
    for (const file of files.filter(f => f.name.endsWith('.md'))) {
      try {
        const contentResp = await fetch(file.download_url);
        if (!contentResp.ok) continue;
        
        const content = await contentResp.text();
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) continue;
        
        const fmText = fmMatch[1];
        const fm: Record<string, unknown> = {};
        
        for (const line of fmText.split('\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const key = line.slice(0, idx).trim();
            let val = line.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            fm[key] = val;
          }
        }
        
        const event: TimelineEvent = {
          date: (fm['date'] as string) || '',
          type: ((fm['type'] as TimelineEventType) || 'rumor'),
          title: (fm['title'] as string) || '',
          description: (fm['excerpt'] as string) || '',
          source: (fm['author'] as string) || 'informegaming',
          sourceUrl: (fm['url'] as string) || '',
          isConfirmed: (fm['type'] as string) === 'announcement' || (fm['type'] as string) === 'trailer' || (fm['type'] as string) === 'release',
        };
        
        timeline.push(event);
      } catch (e) {
        console.error('[GTA6 Timeline] Error parsing file:', e);
      }
    }
    
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return timeline;
  } catch (error) {
    console.error('[GTA6 Timeline] Error:', error);
    return [];
  }
}

// ============================================
// ROUTES: Health, Noticias, Ingest (existentes)
// ============================================

// Health check endpoint (extended)
router.get('/health', async (request, env) => {
  const health = await runHealthChecks(env);
  const statusCode = getHealthStatusCode(health.status);
  
  const response = new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response, request);
});

// Noticias endpoints
router.get('/noticias', async (request, env) => {
  const noticias = await handleGetNoticias(env);
  
  const response = new Response(JSON.stringify(noticias, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response, request);
});

router.post('/noticias', async (request, env) => {
  const noticias = await handlePostNoticias(env);
  
  const response = new Response(JSON.stringify(noticias, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response, request);
});

// Manual trigger endpoint for games ingest
router.post('/ingest', async (request, env) => {
  const result = await runIngest(env);
  
  const response = new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response, request);
});

// GET trigger (for cron via HTTP)
router.get('/ingest', async (request, env) => {
  const result = await runIngest(env);
  
  const response = new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return withSecurity(response, request);
});

// Get current games from KV (legacy endpoint)
router.get('/games', async (request, env) => {
  const data = await env.KV_NAMESPACE.get('juegos.json', 'json');
  
  let response: Response;
  if (!data) {
    response = new Response(JSON.stringify({ 
      generatedAt: new Date().toISOString(),
      version: '1.0',
      games: [],
      message: 'No data yet. Run /ingest first.'
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
      status: 404,
    });
  } else {
    response = new Response(JSON.stringify(data, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  return withSecurity(response, request);
});

// CSP violation report endpoint
router.post('/csp-report', async (request, env) => {
  try {
    const report = await request.json();
    console.warn('[CSP Violation]', JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('[CSP] Failed to parse report:', error);
  }
  return new Response('OK', { status: 204 });
});

// 404 fallback
router.all('*', (request) => {
  const response = new Response(JSON.stringify({ error: 'Not Found' }), { 
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
  return withSecurity(response, request);
});

// ============================================
// MAIN INGEST LOGIC (Games) - UPDATED v2
// ============================================

async function runIngest(env: Env): Promise<IngestOutput & { stats: Record<string, number> }> {
  const startedAt = new Date();
  console.log(`[Ingest v2] Starting at ${startedAt.toISOString()}`);
  
  // Fetch from all sources in parallel (v2 sources)
  const results = await Promise.allSettled([
    fetchGamerPower(env),
    fetchEpicGames(env),
    fetchXboxFreePlayDays(env),
    fetchSteamF2P(env),
    fetchEpicF2P(env),
    fetchGOGFree(env),
    fetchItchioFree(env),
  ]);
  
  // Collect successful results
  const allGames: GameFree[] = [];
  const stats = {
    gamerpower: 0,
    epic: 0,
    xbox: 0,
    steam_f2p: 0,
    epic_f2p: 0,
    gog: 0,
    itchio: 0,
    total: 0,
    deduped: 0,
    errors: 0,
  };
  
  const sourceNames = ['gamerpower', 'epic', 'xbox', 'steam_f2p', 'epic_f2p', 'gog', 'itchio'] as const;
  
  results.forEach((result, index) => {
    const source = sourceNames[index];
    if (!source) return;
    if (result.status === 'fulfilled') {
      let games = result.value;
      
      // Clasificar availabilityType para cada juego
      games = games.map(g => ({
        ...g,
        availabilityType: classifyAvailability(g),
      }));
      
      stats[source] = games.length;
      allGames.push(...games);
      console.log(`[Ingest v2] ${source}: ${games.length} games`);
    } else {
      stats.errors++;
      console.error(`[Ingest v2] ${source} failed:`, result.reason);
    }
  });
  
  // Deduplicate
  const uniqueGames = deduplicateGames(allGames);
  stats.deduped = allGames.length - uniqueGames.length;
  stats.total = uniqueGames.length;
  
  console.log(`[Ingest v2] Total: ${allGames.length}, Unique: ${uniqueGames.length}, Deduped: ${stats.deduped}`);
  
  // Prepare output
  const output: IngestOutput = {
    generatedAt: new Date().toISOString(),
    version: '2.0',
    games: uniqueGames,
  };
  
  // Write to KV
  try {
    await env.KV_NAMESPACE.put('juegos.json', JSON.stringify({
      generatedAt: output.generatedAt,
      version: output.version,
      games: output.games,
    }));
    console.log('[Ingest v2] Written to KV successfully');
  } catch (error) {
    console.error('[Ingest v2] Failed to write to KV:', error);
    throw error;
  }
  
  // Also write to public/data for GitHub Pages deployment
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    await commitToGitHub(env, { 
      generatedAt: output.generatedAt, 
      version: output.version, 
      games: output.games 
    });
  }
  
  const duration = Date.now() - startedAt.getTime();
  console.log(`[Ingest v2] Completed in ${duration}ms`);
  
  return { ...output, stats };
}

// Commit updated JSON to GitHub repo to trigger deploy
async function commitToGitHub(env: Env, output: { generatedAt: string; version: string; games: GameFree[] }): Promise<void> {
  try {
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const path = 'public/data/juegos.json';
    const content = JSON.stringify({
      generatedAt: output.generatedAt,
      version: output.version,
      games: output.games,
    }, null, 2);
    const encodedContent = btoa(content);
    
    // Get current file SHA
    const getResp = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'informegaming-ingest',
      },
    });
    
    let sha: string | undefined;
    if (getResp.ok) {
      const fileData = await getResp.json() as { sha?: string };
      sha = fileData.sha;
    }
    
    // Commit new version
    const commitResp = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'informegaming-ingest',
      },
      body: JSON.stringify({
        message: `chore: update juegos.json v2 [skip ci]\n\nGenerated at ${output.generatedAt}\nGames: ${output.games.length}`,
        content: encodedContent,
        sha,
        branch: 'main',
      }),
    });
    
    if (!commitResp.ok) {
      const err = await commitResp.text();
      console.warn('[GitHub] Commit failed:', err);
    } else {
      console.log('[GitHub] Successfully committed juegos.json v2');
    }
  } catch (error) {
    console.error('[GitHub] Commit error:', error);
  }
}

// ============================================
// SCHEDULED HANDLERS
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Apply rate limiting middleware to all routes
    return withRateLimit(request, env, () => router.handle(request, env, ctx));
  },
  
  // Daily ingest at 6 AM UTC
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Scheduled] Daily ingest triggered', { 
      cron: event.cron, 
      scheduledTime: new Date(event.scheduledTime).toISOString() 
    });
    
    ctx.waitUntil(runIngest(env).catch(err => {
      console.error('[Scheduled] Ingest failed:', err);
    }));
  },
}