/**
 * Main Cloudflare Worker for daily game data ingestion
 * Fetches from multiple sources, normalizes, deduplicates, writes to KV
 */

import { Router } from 'itty-router';
import type { Env, IngestOutput, GameFree } from './types';
import { fetchGamerPower } from './sources/gamerpower';
import { fetchEpicGames } from './sources/epic';
import { fetchXboxFreePlayDays } from './sources/xbox';
import { deduplicateGames } from './utils/normalize';

const router = Router<Request, [Env, ExecutionContext]>();

// Health check endpoint
router.get('/health', () => new Response(JSON.stringify({ 
  status: 'ok', 
  timestamp: new Date().toISOString(),
  version: '1.0.0'
}), {
  headers: { 'Content-Type': 'application/json' },
}));

// Manual trigger endpoint
router.post('/ingest', async (request, env) => {
  const result = await runIngest(env);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// GET trigger (for cron via HTTP)
router.get('/ingest', async (request, env) => {
  const result = await runIngest(env);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// Get current games from KV
router.get('/games', async (request, env) => {
  const data = await env.KV_NAMESPACE.get('juegos.json', 'json');
  if (!data) {
    return new Response(JSON.stringify({ 
      generatedAt: new Date().toISOString(),
      version: '1.0',
      games: [],
      message: 'No data yet. Run /ingest first.'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 404,
    });
  }
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// 404 fallback
router.all('*', () => new Response('Not Found', { status: 404 }));

// Main ingest logic
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

// Scheduled handler (daily cron)
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx);
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Scheduled] Daily ingest triggered', { cron: event.cron, scheduledTime: new Date(event.scheduledTime).toISOString() });
    
    // Run ingest in background
    ctx.waitUntil(runIngest(env).catch(err => {
      console.error('[Scheduled] Ingest failed:', err);
    }));
  },
};