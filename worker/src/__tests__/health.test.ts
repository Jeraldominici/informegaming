/**
 * Tests for health checks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runHealthChecks, getHealthStatusCode } from '../health';

// Mock KV Namespace
const createMockKV = (overrides: { 
  juegosData?: any; 
  putError?: Error;
  getError?: Error;
} = {}) => {
  const store = new Map<string, string>();
  if (overrides.juegosData) {
    store.set('juegos.json', JSON.stringify(overrides.juegosData));
  }
  
  return {
    get: vi.fn(async (key: string, type?: string) => {
      if (overrides.getError) throw overrides.getError;
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === 'json') return JSON.parse(value);
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      if (overrides.putError) throw overrides.putError;
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
};

// Mock fetch globally
const mockFetch = (responses: Map<string, Response>) => {
  const originalFetch = global.fetch;
  
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const urlStr = url instanceof Request ? url.url : url.toString();
    
    for (const [pattern, response] of responses.entries()) {
      if (urlStr.includes(pattern) || urlStr === pattern) {
        return response.clone();
      }
    }
    
    // Default: return ok for any unmatched
    return new Response('OK', { status: 200 });
  });
  
  return () => {
    global.fetch = originalFetch;
  };
};

const createMockEnv = (kv: ReturnType<typeof createMockKV>, overrides: any = {}) => ({
  KV_NAMESPACE: kv,
  PARSE_API_KEY: 'test-key',
  GITHUB_TOKEN: 'test-token',
  GITHUB_REPO: 'test/repo',
  ...overrides,
});

describe('getHealthStatusCode', () => {
  it('should return 200 for ok', () => {
    expect(getHealthStatusCode('ok')).toBe(200);
  });

  it('should return 200 for degraded', () => {
    expect(getHealthStatusCode('degraded')).toBe(200);
  });

  it('should return 503 for down', () => {
    expect(getHealthStatusCode('down')).toBe(503);
  });
});

describe('runHealthChecks', () => {
  let kv: ReturnType<typeof createMockKV>;
  let env: ReturnType<typeof createMockEnv>;
  let restoreFetch: () => void;

  beforeEach(() => {
    kv = createMockKV({
      juegosData: {
        generatedAt: new Date().toISOString(),
        version: '1.0',
        games: [{ id: '1', title: 'Test' }],
      },
    });
    env = createMockEnv(kv);
    
    // Mock all external fetches to succeed
    restoreFetch = mockFetch(new Map([
      ['api.github.com', new Response('OK', { status: 200 })],
      ['api.parse.bot', new Response('OK', { status: 200 })],
      ['gamerpower.com', new Response('OK', { status: 200 })],
      ['reco-public.rec.mp.microsoft.com', new Response('OK', { status: 200 })],
    ]));
  });

  afterEach(() => {
    restoreFetch();
  });

  it('should return ok when all checks pass', async () => {
    const health = await runHealthChecks(env);
    
    expect(health.status).toBe('ok');
    expect(health.checks.kv_read.status).toBe('ok');
    expect(health.checks.kv_write.status).toBe('ok');
    expect(health.checks.github_token.status).toBe('ok');
    expect(health.checks.source_epic.status).toBe('ok');
    expect(health.checks.source_gamerpower.status).toBe('ok');
    expect(health.checks.source_xbox.status).toBe('ok');
    expect(health.checks.last_ingest.status).toBe('ok');
    expect(health.timestamp).toBeDefined();
    expect(health.version).toBe('1.0');
  });

  it('should return degraded when KV read returns empty', async () => {
    const emptyKv = createMockKV({ juegosData: null });
    const emptyEnv = createMockEnv(emptyKv);
    
    const health = await runHealthChecks(emptyEnv);
    
    expect(health.status).toBe('degraded');
    expect(health.checks.kv_read.status).toBe('degraded');
    expect(health.checks.kv_read.message).toContain('empty');
  });

  it('should return down when KV write fails', async () => {
    const failingKv = createMockKV({ putError: new Error('KV write failed') });
    const failingEnv = createMockEnv(failingKv);
    
    const health = await runHealthChecks(failingEnv);
    
    expect(health.status).toBe('down');
    expect(health.checks.kv_write.status).toBe('down');
  });

  it('should return degraded when GitHub token is invalid', async () => {
    restoreFetch();
    restoreFetch = mockFetch(new Map([
      ['api.github.com', new Response('Unauthorized', { status: 401 })],
      ['api.parse.bot', new Response('OK', { status: 200 })],
      ['gamerpower.com', new Response('OK', { status: 200 })],
      ['reco-public.rec.mp.microsoft.com', new Response('OK', { status: 200 })],
    ]));
    
    const health = await runHealthChecks(env);
    
    expect(health.status).toBe('degraded');
    expect(health.checks.github_token.status).toBe('down');
  });

  it('should return degraded when GitHub token not configured', async () => {
    const noTokenEnv = createMockEnv(kv, { GITHUB_TOKEN: undefined });
    
    const health = await runHealthChecks(noTokenEnv);
    
    expect(health.checks.github_token.status).toBe('degraded');
    expect(health.checks.github_token.message).toContain('not configured');
  });

  it('should return degraded when source is unreachable', async () => {
    restoreFetch();
    restoreFetch = mockFetch(new Map([
      ['api.github.com', new Response('OK', { status: 200 })],
      ['api.parse.bot', new Response('Service Unavailable', { status: 503 })],
      ['gamerpower.com', new Response('OK', { status: 200 })],
      ['reco-public.rec.mp.microsoft.com', new Response('OK', { status: 200 })],
    ]));
    
    const health = await runHealthChecks(env);
    
    expect(health.status).toBe('degraded');
    expect(health.checks.source_epic.status).toBe('degraded');
  });

  it('should return degraded when last ingest is stale', async () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    const staleKv = createMockKV({
      juegosData: {
        generatedAt: oldDate,
        version: '1.0',
        games: [],
      },
    });
    const staleEnv = createMockEnv(staleKv);
    
    const health = await runHealthChecks(staleEnv);
    
    expect(health.status).toBe('degraded');
    expect(health.checks.last_ingest.status).toBe('degraded');
    expect(health.checks.last_ingest.message).toContain('stale');
  });

  it('should return ok when last ingest is recent', async () => {
    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    const recentKv = createMockKV({
      juegosData: {
        generatedAt: recentDate,
        version: '1.0',
        games: [],
      },
    });
    const recentEnv = createMockEnv(recentKv);
    
    const health = await runHealthChecks(recentEnv);
    
    expect(health.checks.last_ingest.status).toBe('ok');
  });

  it('should include lastIngest timestamp in response', async () => {
    const health = await runHealthChecks(env);
    
    expect(health.lastIngest).toBeDefined();
    expect(new Date(health.lastIngest!).getTime()).not.toBeNaN();
  });

  it('should handle fetch timeout gracefully', async () => {
    restoreFetch();
    // Mock a slow/failing response
    restoreFetch = mockFetch(new Map([
      ['api.github.com', new Promise(resolve => setTimeout(() => resolve(new Response('OK')), 6000))],
      ['api.parse.bot', new Response('OK', { status: 200 })],
      ['gamerpower.com', new Response('OK', { status: 200 })],
      ['reco-public.rec.mp.microsoft.com', new Response('OK', { status: 200 })],
    ]));
    
    const health = await runHealthChecks(env);
    
    expect(health.checks.github_token.status).toBe('degraded');
    expect(health.checks.github_token.message).toContain('timeout');
  });

  it('should handle KV get error gracefully', async () => {
    const errorKv = createMockKV({ getError: new Error('KV connection failed') });
    const errorEnv = createMockEnv(errorKv);
    
    const health = await runHealthChecks(errorEnv);
    
    expect(health.checks.kv_read.status).toBe('down');
  });
});