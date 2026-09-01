/**
 * Tests for Xbox Free Play Days source
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchXboxFreePlayDays } from '../sources/xbox';

// Mock fetch globally
const mockFetch = (response: Response) => {
  const originalFetch = global.fetch;
  global.fetch = vi.fn().mockResolvedValue(response.clone());
  return () => { global.fetch = originalFetch; };
};

const createMockEnv = () => ({});

describe('fetchXboxFreePlayDays', () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
  });

  it('should return empty array when API returns error', async () => {
    restoreFetch = mockFetch(new Response('Service Unavailable', { status: 503 }));
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    expect(games).toEqual([]);
  });

  it('should return empty array when no items', async () => {
    restoreFetch = mockFetch(new Response(JSON.stringify({ Items: [], TotalItems: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    expect(games).toEqual([]);
  });

  it('should parse and normalize Free Play Days', async () => {
    const mockResponse = {
      Items: [
        {
          ProductId: 'TEST-123',
          Title: 'Test Game',
          StartDate: '2026-08-28T15:00:00Z',
          EndDate: '2026-09-04T15:00:00Z',
          ProductUrl: 'https://www.xbox.com/test-game',
          ImageUrl: 'https://example.com/image.jpg',
          ShortDescription: 'A test game for Xbox Free Play Days',
        },
      ],
      TotalItems: 1,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Test Game');
    expect(games[0].platform).toBe('Xbox');
    expect(games[0].source).toBe('xbox');
    expect(games[0].type).toBe('free_weekend');
    expect(games[0].storeUrl).toBe('https://www.xbox.com/test-game');
    expect(games[0].imageUrl).toBe('https://example.com/image.jpg');
    expect(games[0].startsAt).toBe('2026-08-28T15:00:00.000Z');
    expect(games[0].endsAt).toBe('2026-09-04T15:00:00.000Z');
    expect(games[0].isActive).toBe(true);
  });

  it('should handle missing optional fields', async () => {
    const mockResponse = {
      Items: [
        {
          ProductId: 'TEST-123',
          Title: 'Minimal Game',
          StartDate: '2026-08-28T15:00:00Z',
          EndDate: '2026-09-04T15:00:00Z',
        },
      ],
      TotalItems: 1,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Minimal Game');
    expect(games[0].storeUrl).toContain('TEST-123');
    expect(games[0].imageUrl).toContain('placeholder.com');
    expect(games[0].description).toBe('');
  });

  it('should construct store URL from ProductId when ProductUrl missing', async () => {
    const mockResponse = {
      Items: [
        {
          ProductId: '9NBLGGH5555',
          Title: 'Game Without URL',
          StartDate: '2026-08-28T15:00:00Z',
          EndDate: '2026-09-04T15:00:00Z',
        },
      ],
      TotalItems: 1,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games[0].storeUrl).toBe('https://www.xbox.com/en-US/games/store/9NBLGGH5555');
  });

  it('should construct image URL from ProductId when ImageUrl missing', async () => {
    const mockResponse = {
      Items: [
        {
          ProductId: '9NBLGGH5555',
          Title: 'Game Without Image',
          StartDate: '2026-08-28T15:00:00Z',
          EndDate: '2026-09-04T15:00:00Z',
        },
      ],
      TotalItems: 1,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games[0].imageUrl).toBe('https://store-images.microsoft.com/image/9NBLGGH5555');
  });

  it('should skip items without Title or ProductId', async () => {
    const mockResponse = {
      Items: [
        { Title: '', ProductId: '123', StartDate: '2026-08-28', EndDate: '2026-09-04' },
        { Title: 'Valid Game', ProductId: '', StartDate: '2026-08-28', EndDate: '2026-09-04' },
        { Title: 'Valid Game 2', ProductId: '456', StartDate: '2026-08-28', EndDate: '2026-09-04' },
      ],
      TotalItems: 3,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Valid Game 2');
  });

  it('should handle invalid dates gracefully', async () => {
    const mockResponse = {
      Items: [
        {
          ProductId: 'TEST-123',
          Title: 'Invalid Dates Game',
          StartDate: 'invalid-date',
          EndDate: 'also-invalid',
        },
      ],
      TotalItems: 1,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games).toHaveLength(1);
    // Should use far future fallback
    expect(games[0].startsAt).toBe('2099-12-31T23:59:59.000Z');
    expect(games[0].endsAt).toBe('2099-12-31T23:59:59.000Z');
  });

  it('should include raw data', async () => {
    const mockResponse = {
      Items: [
        {
          ProductId: 'TEST-123',
          Title: 'Test Game',
          StartDate: '2026-08-28T15:00:00Z',
          EndDate: '2026-09-04T15:00:00Z',
          ProductUrl: 'https://www.xbox.com/test-game',
        },
      ],
      TotalItems: 1,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games[0].raw).toBeDefined();
    expect(games[0].raw.product_id).toBe('TEST-123');
    expect(games[0].raw.start_date).toBe('2026-08-28T15:00:00Z');
    expect(games[0].raw.end_date).toBe('2026-09-04T15:00:00Z');
  });

  it('should generate unique ID', async () => {
    const mockResponse = {
      Items: [
        {
          ProductId: 'TEST-123',
          Title: 'Test Game',
          StartDate: '2026-08-28T15:00:00Z',
          EndDate: '2026-09-04T15:00:00Z',
        },
      ],
      TotalItems: 1,
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchXboxFreePlayDays(env);
    
    expect(games[0].id).toContain('xbox');
    expect(games[0].id).toContain('xbox');
    expect(games[0].id).toContain('test-game');
  });
});