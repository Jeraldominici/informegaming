/**
 * Rate Limiting Middleware - KV-backed Sliding Window
 * Protects endpoints from abuse: 10 requests per minute per IP per endpoint
 */

import type { Env } from '../types';

interface RateLimitData {
  count: number;
  resetAt: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60000; // 1 minute
const KV_PREFIX = 'ratelimit:';

/**
 * Rate limit configuration per endpoint
 */
export interface RateLimitConfig {
  limit?: number;
  windowMs?: number;
  keyPrefix?: string;
}

/**
 * Default configurations per endpoint
 */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  '/ingest': { limit: 10, windowMs: 60000 },
  '/games': { limit: 30, windowMs: 60000 }, // Higher limit for read endpoint
  '/noticias': { limit: 30, windowMs: 60000 },
  '/health': { limit: 60, windowMs: 60000 }, // Health checks can be more frequent
};

/**
 * Extract client IP from request
 */
function getClientIP(request: Request): string {
  // Cloudflare provides CF-Connecting-IP header
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP;
  
  // Fallback to other headers
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) {
    const firstIP = forwarded.split(',')[0];
    if (firstIP) return firstIP.trim();
  }
  
  const realIP = request.headers.get('X-Real-IP');
  if (realIP) return realIP;
  
  return 'unknown';
}

/**
 * Generate rate limit key
 */
function generateRateLimitKey(ip: string, pathname: string, keyPrefix: string): string {
  return `${KV_PREFIX}${keyPrefix}${ip}:${pathname}`;
}

/**
 * Check and increment rate limit
 * Returns null if OK, Response with 429 if rate limited
 */
export async function checkRateLimit(
  request: Request,
  env: Env,
  config: RateLimitConfig = {}
): Promise<Response | null> {
  const ip = getClientIP(request);
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Get endpoint-specific config
  const endpointConfig = RATE_LIMIT_CONFIGS[pathname] || {};
  const limit = config.limit ?? endpointConfig.limit ?? DEFAULT_LIMIT;
  const windowMs = config.windowMs ?? endpointConfig.windowMs ?? DEFAULT_WINDOW_MS;
  const keyPrefix = config.keyPrefix ?? endpointConfig.keyPrefix ?? '';
  
  // Skip rate limiting for unknown IPs (shouldn't happen with CF)
  if (ip === 'unknown') {
    console.warn('[RateLimit] Unknown IP, skipping limit');
    return null;
  }
  
  const key = generateRateLimitKey(ip, pathname, keyPrefix);
  const now = Date.now();
  
  try {
    // Get current count from KV
    const current = await env.KV_NAMESPACE.get<RateLimitData>(key, 'json');
    
    if (!current || now > current.resetAt) {
      // First request or window expired
      const resetAt = now + windowMs;
      await env.KV_NAMESPACE.put(key, JSON.stringify({ count: 1, resetAt }), {
        expirationTtl: Math.ceil(windowMs / 1000) + 10, // TTL slightly longer than window
      });
      
      // Add rate limit headers to response (handled by caller)
      return null;
    }
    
    if (current.count >= limit) {
      // Rate limited
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      console.warn(`[RateLimit] IP ${ip} rate limited on ${pathname}: ${current.count}/${limit}`);
      
      return new Response(JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(current.resetAt / 1000)),
        },
      });
    }
    
    // Increment count
    current.count++;
    await env.KV_NAMESPACE.put(key, JSON.stringify(current), {
      expirationTtl: Math.ceil(windowMs / 1000) + 10,
    });
    
    return null;
    
  } catch (error) {
    console.error('[RateLimit] KV error:', error);
    // Fail open - don't block on KV errors
    return null;
  }
}

/**
 * Add rate limit headers to successful response
 */
export function addRateLimitHeaders(
  response: Response,
  request: Request,
  env: Env,
  config: RateLimitConfig = {}
): Response {
  const ip = getClientIP(request);
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  const endpointConfig = RATE_LIMIT_CONFIGS[pathname] || {};
  const limit = config.limit ?? endpointConfig.limit ?? DEFAULT_LIMIT;
  const keyPrefix = config.keyPrefix ?? endpointConfig.keyPrefix ?? '';
  const key = generateRateLimitKey(ip, pathname, keyPrefix);
  
  // We can't easily get current count without another KV read
  // Headers will be added by checkRateLimit on next request
  // For now, just add the limit header
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Limit', String(limit));
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Middleware factory for easy integration
 */
export function createRateLimitMiddleware(config: RateLimitConfig = {}) {
  return async (request: Request, env: Env, next: () => Promise<Response>): Promise<Response> => {
    const rateLimitResponse = await checkRateLimit(request, env, config);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    const response = await next();
    return addRateLimitHeaders(response, request, env, config);
  };
}