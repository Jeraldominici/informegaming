/**
 * Main Cloudflare Worker for informegaming
 * - Daily game data ingestion (Epic, GamerPower, Xbox)
 * - Noticias endpoint (Markdown-based, KV-backed)
 * - Health checks with dependency verification
 * - Rate limiting (KV-backed sliding window)
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - CORS restrictive
 */

import { Router } from 'itty-router';
import type { 
  Env, 
  IngestOutput, 
  GameFree, 
  NewsOutput, 
  HealthOutput 
} from './types';
import { fetchGamerPower } from './sources/gamerpower';
import { fetchEpicGames } from './sources/epic';
import { fetchXboxFreePlayDays } from './sources/xbox';
import { handleGetNoticias, handlePostNoticias } from './sources/noticias';
import { deduplicateGames } from './utils/normalize';
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
// ROUTES
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

// Get current games from KV
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
// MAIN INGEST LOGIC (Games)
// ============================================

async function runIngest(env: Env): Promise<IngestOutput & { stats: Record<string, number> }> {
  const startedAt = new Date();
  console.log(`[Ingest] Starting at ${startedAt.toISOString()}`);
  
  // Fetch from all sources in parallel
  const results = await Promise.allSettled([
    fetchGamerPower(env),
    fetchEpicGames(env),
    fetchXboxFreePlayDays(env),
    // fetchSteamGames(env), // TODO: implement when source ready
    // fetchPSPlusGames(env), // TODO: implement when source ready
  ]);
  
  // Collect successful results
  const allGames: GameFree[] = [];
  const stats = {
    gamerpower: 0,
    epic: 0,
    xbox: 0,
    total: 0,
    deduped: 0,
    errors: 0,
  };
  
  const sourceNames = ['gamerpower', 'epic', 'xbox'] as const;
  
  results.forEach((result, index) => {
    const source = sourceNames[index];
    if (!source) return;
    if (result.status === 'fulfilled') {
      const games = result.value;
      stats[source] = games.length;
      allGames.push(...games);
      console.log(`[Ingest] ${source}: ${games.length} games`);
    } else {
      stats.errors++;
      console.error(`[Ingest] ${source} failed:`, result.reason);
    }
  });
  
  // Deduplicate
  const uniqueGames = deduplicateGames(allGames);
  stats.deduped = allGames.length - uniqueGames.length;
  stats.total = uniqueGames.length;
  
  console.log(`[Ingest] Total: ${allGames.length}, Unique: ${uniqueGames.length}, Deduped: ${stats.deduped}`);
  
  // Prepare output
  const output: IngestOutput = {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    games: uniqueGames,
  };
  
  // Write to KV
  try {
    await env.KV_NAMESPACE.put('juegos.json', JSON.stringify(output));
    console.log('[Ingest] Written to KV successfully');
  } catch (error) {
    console.error('[Ingest] Failed to write to KV:', error);
    throw error;
  }
  
  // Also write to public/data for GitHub Pages deployment (if GITHUB_TOKEN set)
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    await commitToGitHub(env, output);
  }
  
  const duration = Date.now() - startedAt.getTime();
  console.log(`[Ingest] Completed in ${duration}ms`);
  
  return { ...output, stats };
}

// Commit updated JSON to GitHub repo to trigger deploy
async function commitToGitHub(env: Env, output: IngestOutput): Promise<void> {
  try {
    const repo = env.GITHUB_REPO; // format: "owner/repo"
    const token = env.GITHUB_TOKEN;
    const path = 'public/data/juegos.json';
    const content = JSON.stringify(output, null, 2);
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
        message: `chore: update juegos.json [skip ci]\n\nGenerated at ${output.generatedAt}\nGames: ${output.games.length}`,
        content: encodedContent,
        sha,
        branch: 'main',
      }),
    });
    
    if (!commitResp.ok) {
      const err = await commitResp.text();
      console.warn('[GitHub] Commit failed:', err);
    } else {
      console.log('[GitHub] Successfully committed juegos.json');
    }
  } catch (error) {
    console.error('[GitHub] Commit error:', error);
  }
}

// ============================================
// SCHEDULED HANDLER (Daily Cron)
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Apply rate limiting middleware to all routes
    return withRateLimit(request, env, () => router.handle(request, env, ctx));
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Scheduled] Daily ingest triggered', { 
      cron: event.cron, 
      scheduledTime: new Date(event.scheduledTime).toISOString() 
    });
    
    // Run ingest in background
    ctx.waitUntil(runIngest(env).catch(err => {
      console.error('[Scheduled] Ingest failed:', err);
    }));
  },
};