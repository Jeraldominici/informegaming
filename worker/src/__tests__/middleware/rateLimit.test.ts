/**
 * Tests for rateLimit middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, addRateLimitHeaders, RATE_LIMIT_CONFIGS, createRateLimitMiddleware } from '../middleware/rateLimit';

// Mock KV Namespace
const createMockKV = () => {
  const store = new Map<string, any>();
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === 'json') return value;
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
};

// Mock Request
const createMockRequest = (url: string, headers: Record<string, string> = {}) => {
  const h = new Headers(headers);
  h.set('CF-Connecting-IP', headers['CF-Connecting-IP'] || '1.2.3.4');
  return new Request(url, { headers: h });
};

// Mock Env
const createMockEnv = (kv: ReturnType<typeof createMockKV>) => ({
  KV_NAMESPACE: kv,
});

describe('checkRateLimit', () => {
  let kv: ReturnType<typeof createMockKV>;
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    kv = createMockKV();
    env = createMockEnv(kv);
  });

  it('should allow first request', async () => {
    const request = createMockRequest('https://example.com/games');
    const result = await checkRateLimit(request, env);
    expect(result).toBeNull();
  });

  it('should allow requests under limit', async () => {
    const request = createMockRequest('https://example.com/games');
    
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(request, env);
      expect(result).toBeNull();
    }
  });

  it('should block requests over limit', async () => {
    const request = createMockRequest('https://example.com/games');
    const config = { limit: 3, windowMs: 60000 };
    
    // Make 3 requests (limit)
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(request, env, config);
      expect(result).toBeNull();
    }
    
    // 4th request should be blocked
    const result = await checkRateLimit(request, env, config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('should return 429 with Retry-After header', async () => {
    const request = createMockRequest('https://example.com/games');
    const config = { limit: 1, windowMs: 60000 };
    
    await checkRateLimit(request, env, config); // First request
    const result = await checkRateLimit(request, env, config); // Second request
    
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get('Retry-After')).toBeDefined();
    expect(result!.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(result!.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('should use different keys for different IPs', async () => {
    const request1 = createMockRequest('https://example.com/games', { 'CF-Connecting-IP': '1.2.3.4' });
    const request2 = createMockRequest('https://example.com/games', { 'CF-Connecting-IP': '5.6.7.8' });
    const config = { limit: 1, windowMs: 60000 };
    
    await checkRateLimit(request1, env, config);
    const result = await checkRateLimit(request2, env, config);
    
    expect(result).toBeNull(); // Different IP, should be allowed
  });

  it('should use different keys for different endpoints', async () => {
    const request1 = createMockRequest('https://example.com/games');
    const request2 = createMockRequest('https://example.com/ingest');
    const config = { limit: 1, windowMs: 60000 };
    
    await checkRateLimit(request1, env, config);
    const result = await checkRateLimit(request2, env, config);
    
    expect(result).toBeNull(); // Different endpoint, should be allowed
  });

  it('should fall back to X-Forwarded-For if CF-Connecting-IP missing', async () => {
    const h = new Headers();
    h.set('X-Forwarded-For', '10.0.0.1, 192.168.1.1');
    const request = new Request('https://example.com/games', { headers: h });
    const config = { limit: 1, windowMs: 60000 };
    
    const result = await checkRateLimit(request, env, config);
    expect(result).toBeNull();
  });

  it('should fall back to X-Real-IP if both missing', async () => {
    const h = new Headers();
    h.set('X-Real-IP', '10.0.0.1');
    const request = new Request('https://example.com/games', { headers: h });
    const config = { limit: 1, windowMs: 60000 };
    
    const result = await checkRateLimit(request, env, config);
    expect(result).toBeNull();
  });

  it('should use "unknown" if no IP headers', async () => {
    const h = new Headers();
    const request = new Request('https://example.com/games', { headers: h });
    const config = { limit: 1, windowMs: 60000 };
    
    const result = await checkRateLimit(request, env, config);
    expect(result).toBeNull(); // Fail open
  });

  it('should respect window expiry', async () => {
    const request = createMockRequest('https://example.com/games');
    const config = { limit: 1, windowMs: 100 }; // 100ms window
    
    await checkRateLimit(request, env, config);
    
    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const result = await checkRateLimit(request, env, config);
    expect(result).toBeNull(); // Should be allowed after window expires
  });

  it('should fail open on KV errors', async () => {
    const brokenKV = {
      get: vi.fn().mockRejectedValue(new Error('KV Error')),
      put: vi.fn().mockRejectedValue(new Error('KV Error')),
    };
    const brokenEnv = { KV_NAMESPACE: brokenKV };
    const request = createMockRequest('https://example.com/games');
    
    const result = await checkRateLimit(request, brokenEnv);
    expect(result).toBeNull(); // Fail open
  });
});

describe('addRateLimitHeaders', () => {
  it('should add X-RateLimit-Limit header', () => {
    const response = new Response('OK');
    const request = createMockRequest('https://example.com/games');
    const env = createMockEnv(createMockKV());
    
    const result = addRateLimitHeaders(response, request, env);
    expect(result.headers.get('X-RateLimit-Limit')).toBeDefined();
  });

  it('should use endpoint-specific limit', () => {
    const response = new Response('OK');
    const request = createMockRequest('https://example.com/ingest');
    const env = createMockEnv(createMockKV());
    
    const result = addRateLimitHeaders(response, request, env);
    // /ingest has limit 10 by default
    expect(result.headers.get('X-RateLimit-Limit')).toBe('10');
  });
});

describe('createRateLimitMiddleware', () => {
  it('should return 429 when rate limited', async () => {
    const kv = createMockKV();
    const env = createMockEnv(kv);
    const middleware = createRateLimitMiddleware({ limit: 1, windowMs: 60000 });
    
    const request = createMockRequest('https://example.com/test');
    
    // First request - allowed
    const response1 = await middleware(request, env, async () => new Response('OK'));
    expect(response1.status).toBe(200);
    
    // Second request - rate limited
    const response2 = await middleware(request, env, async () => new Response('OK'));
    expect(response2.status).toBe(429);
  });

  it('should call next() when not rate limited', async () => {
    const kv = createMockKV();
    const env = createMockEnv(kv);
    const middleware = createRateLimitMiddleware({ limit: 10, windowMs: 60000 });
    
    const request = createMockRequest('https://example.com/test');
    const response = await middleware(request, env, async () => new Response('OK'));
    
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });
});