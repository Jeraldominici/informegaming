/**
 * Security Headers Middleware
 * Adds CSP, X-Frame-Options, Referrer-Policy, and other security headers
 */

import type { Env } from '../types';

/**
 * Content Security Policy
 * Allows: self scripts/styles, inline scripts/styles (legacy), 
 * images from https/data, fonts from self, 
 * connect to Worker API and external sources
 */
export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // 'unsafe-inline' needed for inline scripts in index.html
  "style-src 'self' 'unsafe-inline'", // 'unsafe-inline' needed for inline styles
  "img-src 'self' data: https:", // Images from self, data URIs, and any HTTPS
  "font-src 'self'", // Fonts from self
  "connect-src 'self' https://informegaming-ingest.informegaming-ingest.workers.dev https://www.gamerpower.com https://api.parse.bot https://reco-public.rec.mp.microsoft.com", // API connections
  "frame-ancestors 'none'", // Prevent clickjacking
  "base-uri 'self'", // Restrict <base> tag
  "form-action 'self'", // Restrict form submissions
  "object-src 'none'", // Prevent plugins
].join('; ');

/**
 * CSP Report-Only policy (for testing before enforcing)
 */
export const CSP_REPORT_ONLY = CSP_POLICY + '; report-uri /csp-report';

/**
 * Security headers to add to all responses
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * CORS configuration - restrictive origins only
 */
export const ALLOWED_ORIGINS = [
  'https://jeral.github.io', // GitHub Pages (adjust to actual domain)
  'http://localhost:3000',   // Vite dev server
  'http://127.0.0.1:3000',
];

/**
 * Get CORS headers for a request
 */
export function getCORSHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const defaultOrigin = ALLOWED_ORIGINS[0] || '*';
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : defaultOrigin;
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false',
  };
}

/**
 * Handle OPTIONS preflight request
 */
export function handleCORSPreflight(request: Request): Response {
  const headers = getCORSHeaders(request);
  return new Response(null, { status: 204, headers });
}

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  
  // CSP
  headers.set('Content-Security-Policy', CSP_POLICY);
  
  // Security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  
  // CORS (only for API endpoints, not for static assets)
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ingest') || 
      url.pathname.startsWith('/games') || url.pathname.startsWith('/noticias') ||
      url.pathname.startsWith('/health')) {
    const corsHeaders = getCORSHeaders(request);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Middleware factory
 */
export function createSecurityHeadersMiddleware() {
  return async (request: Request, env: Env, next: () => Promise<Response>): Promise<Response> => {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORSPreflight(request);
    }
    
    const response = await next();
    return applySecurityHeaders(response, request);
  };
}

/**
 * CSP violation report handler (optional endpoint)
 */
export async function handleCSPReport(request: Request, env: Env): Promise<Response> {
  try {
    const report = await request.json();
    console.warn('[CSP Violation]', JSON.stringify(report, null, 2));
    // Could send to monitoring service here
  } catch (error) {
    console.error('[CSP] Failed to parse report:', error);
  }
  return new Response('OK', { status: 204 });
}