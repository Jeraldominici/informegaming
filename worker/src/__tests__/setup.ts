/**
 * Vitest setup file for Cloudflare Workers tests
 * Provides mocks and utilities for testing
 */

import { vi } from 'vitest';

// Mock KV Namespace
export const createMockKV = () => {
  const store = new Map<string, string>();
  
  return {
    get: vi.fn(async (key: string, type?: 'json' | 'text' | 'arrayBuffer' | 'stream') => {
      const value = store.get(key);
      if (value === undefined) return null;
      
      if (type === 'json') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: Array.from(store.keys()).map(name => ({ name })) })),
    _store: store,
  };
};

// Mock fetch globally
export const mockFetch = (responses: Map<string, Response>) => {
  const originalFetch = global.fetch;
  
  global.fetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const urlStr = url instanceof Request ? url.url : url.toString();
    
    // Find matching response
    for (const [pattern, response] of responses.entries()) {
      if (urlStr.includes(pattern) || urlStr === pattern) {
        return response.clone();
      }
    }
    
    // Default: call original (will fail in tests)
    return originalFetch(url, options);
  });
  
  return () => {
    global.fetch = originalFetch;
  };
};

// Mock Response helpers
export const createMockResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
};

export const createMockErrorResponse = (status = 500, message = 'Internal Server Error') => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Mock Cloudflare env
export const createMockEnv = (overrides: Partial<Env> = {}) => {
  const kv = createMockKV();
  
  return {
    KV_NAMESPACE: kv,
    PARSE_API_KEY: 'test-api-key',
    GITHUB_TOKEN: 'test-github-token',
    GITHUB_REPO: 'test/repo',
    ...overrides,
  };
};

// Type for Env (imported from types)
type Env = {
  KV_NAMESPACE: KVNamespace;
  PARSE_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
};

// Mock KVNamespace type
interface KVNamespace {
  get(key: string, type?: 'json' | 'text' | 'arrayBuffer' | 'stream'): Promise<any>;
  put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string }> }>;
}

// Export test utilities
export const testUtils = {
  createMockKV,
  mockFetch,
  createMockResponse,
  createMockErrorResponse,
  createMockEnv,
};