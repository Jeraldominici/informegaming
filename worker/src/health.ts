/**
 * Health Checks - Extended health endpoint with dependency checks
 * Checks: KV read/write, GitHub API, external sources, last ingest timestamp
 */

import type { Env, HealthOutput, HealthCheckResult } from './types';

const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds per check
const LAST_INGEST_THRESHOLD_MS = 36 * 60 * 60 * 1000; // 36 hours

/**
 * Check KV read capability
 */
async function checkKVRead(env: Env): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const data = await env.KV_NAMESPACE.get('juegos.json', 'json');
    const duration = Date.now() - start;
    
    if (data) {
      return { name: 'kv_read', status: 'ok', message: 'KV read successful', durationMs: duration };
    }
    return { name: 'kv_read', status: 'degraded', message: 'KV empty (no data yet)', durationMs: duration };
  } catch (error) {
    return { 
      name: 'kv_read', 
      status: 'down', 
      message: `KV read failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      durationMs: Date.now() - start 
    };
  }
}

/**
 * Check KV write capability
 */
async function checkKVWrite(env: Env): Promise<HealthCheckResult> {
  const start = Date.now();
  const testKey = `health-test-${Date.now()}`;
  try {
    await env.KV_NAMESPACE.put(testKey, JSON.stringify({ test: true, timestamp: Date.now() }), { expirationTtl: 60 });
    await env.KV_NAMESPACE.delete(testKey);
    return { name: 'kv_write', status: 'ok', message: 'KV write successful', durationMs: Date.now() - start };
  } catch (error) {
    return { 
      name: 'kv_write', 
      status: 'down', 
      message: `KV write failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      durationMs: Date.now() - start 
    };
  }
}

/**
 * Check GitHub API token validity
 */
async function checkGitHubToken(env: Env): Promise<HealthCheckResult> {
  const start = Date.now();
  
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { 
      name: 'github_token', 
      status: 'degraded', 
      message: 'GitHub token/repo not configured',
      durationMs: Date.now() - start 
    };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
    
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, {
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'informegaming-health',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      return { name: 'github_token', status: 'ok', message: 'GitHub API accessible', durationMs: Date.now() - start };
    }
    
    if (response.status === 401) {
      return { name: 'github_token', status: 'down', message: 'GitHub token invalid', durationMs: Date.now() - start };
    }
    
    return { name: 'github_token', status: 'degraded', message: `GitHub API returned ${response.status}`, durationMs: Date.now() - start };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { name: 'github_token', status: 'degraded', message: 'GitHub API timeout', durationMs: Date.now() - start };
    }
    return { name: 'github_token', status: 'degraded', message: `GitHub API error: ${error instanceof Error ? error.message : 'Unknown'}`, durationMs: Date.now() - start };
  }
}

/**
 * Check external source reachability (HEAD request)
 */
async function checkSourceReachability(name: string, url: string): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'informegaming-health' },
    });
    
    clearTimeout(timeout);
    
    if (response.ok || response.status === 405 || response.status === 403) {
      // 405/403 means endpoint exists but method not allowed / forbidden - still reachable
      return { name: `source_${name}`, status: 'ok', message: `${name} reachable`, durationMs: Date.now() - start };
    }
    
    return { name: `source_${name}`, status: 'degraded', message: `${name} returned ${response.status}`, durationMs: Date.now() - start };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { name: `source_${name}`, status: 'degraded', message: `${name} timeout`, durationMs: Date.now() - start };
    }
    return { name: `source_${name}`, status: 'degraded', message: `${name} unreachable: ${error instanceof Error ? error.message : 'Unknown'}`, durationMs: Date.now() - start };
  }
}

/**
 * Check all external sources
 */
async function checkSources(env: Env): Promise<Record<string, HealthCheckResult>> {
  const sources = {
    epic: 'https://api.parse.bot',
    gamerpower: 'https://www.gamerpower.com',
    xbox: 'https://reco-public.rec.mp.microsoft.com',
  };
  
  const results: Record<string, HealthCheckResult> = {};
  
  // Run checks in parallel
  const promises = Object.entries(sources).map(([name, url]) => 
    checkSourceReachability(name, url).then(result => { results[name] = result; })
  );
  
  await Promise.allSettled(promises);
  return results;
}

/**
 * Check last ingest timestamp
 */
async function checkLastIngest(env: Env): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const data = await env.KV_NAMESPACE.get('juegos.json', 'json') as { generatedAt?: string } | null;
    
    if (!data?.generatedAt) {
      return { name: 'last_ingest', status: 'degraded', message: 'No ingest data found', durationMs: Date.now() - start };
    }
    
    const lastIngest = new Date(data.generatedAt).getTime();
    const now = Date.now();
    const diff = now - lastIngest;
    
    if (diff < LAST_INGEST_THRESHOLD_MS) {
      return { name: 'last_ingest', status: 'ok', message: `Last ingest ${Math.round(diff / 3600000)}h ago`, durationMs: Date.now() - start };
    }
    
    return { name: 'last_ingest', status: 'degraded', message: `Last ingest ${Math.round(diff / 3600000)}h ago (stale)`, durationMs: Date.now() - start };
  } catch (error) {
    return { name: 'last_ingest', status: 'degraded', message: `Check failed: ${error instanceof Error ? error.message : 'Unknown'}`, durationMs: Date.now() - start };
  }
}

/**
 * Run all health checks and aggregate status
 */
export async function runHealthChecks(env: Env): Promise<HealthOutput> {
  const start = Date.now();
  
  // Run all checks in parallel
  const [kvRead, kvWrite, github, sources, lastIngest] = await Promise.allSettled([
    checkKVRead(env),
    checkKVWrite(env),
    checkGitHubToken(env),
    checkSources(env),
    checkLastIngest(env),
  ]);
  
  // Process results
  const checks: Record<string, HealthCheckResult> = {};
  const addCheck = (result: PromiseSettledResult<HealthCheckResult | Record<string, HealthCheckResult>>) => {
    if (result.status === 'fulfilled') {
      const value = result.value;
      if (isSingleCheck(value)) {
        // Single check
        checks[value.name] = value;
      } else {
        // Multiple checks (sources)
        Object.assign(checks, value);
      }
    } else {
      checks['unknown'] = { name: 'unknown', status: 'down', message: `Check threw: ${result.reason}`, durationMs: 0 };
    }
  };
  
  function isSingleCheck(v: HealthCheckResult | Record<string, HealthCheckResult>): v is HealthCheckResult {
    return 'name' in v && 'status' in v && 'durationMs' in v;
  }
  
  addCheck(kvRead);
  addCheck(kvWrite);
  addCheck(github);
  addCheck(sources);
  addCheck(lastIngest);
  
  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';
  
  if (statuses.includes('down')) {
    overallStatus = 'down';
  } else if (statuses.includes('degraded')) {
    overallStatus = 'degraded';
  }
  
  // Get last ingest timestamp for response
  let lastIngestTime: string | undefined;
  try {
    const data = await env.KV_NAMESPACE.get('juegos.json', 'json') as { generatedAt?: string } | null;
    lastIngestTime = data?.generatedAt;
  } catch {
    // Ignore
  }
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '1.0',
    checks,
    lastIngest: lastIngestTime,
  };
}

/**
 * Determine HTTP status code from health status
 */
export function getHealthStatusCode(status: 'ok' | 'degraded' | 'down'): number {
  switch (status) {
    case 'ok': return 200;
    case 'degraded': return 200; // Still 200 but with degraded info
    case 'down': return 503;
  }
}