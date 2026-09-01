/**
 * Tests for Epic Games source
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchEpicGames } from '../sources/epic';

// Mock fetch globally
const mockFetch = (response: Response) => {
  const originalFetch = global.fetch;
  global.fetch = vi.fn().mockResolvedValue(response.clone());
  return () => { global.fetch = originalFetch; };
};

const createMockEnv = (apiKey = 'test-key') => ({
  PARSE_API_KEY: apiKey,
});

describe('fetchEpicGames', () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (restoreFetch) restoreFetch();
  });

  it('should return empty array when PARSE_API_KEY not configured', async () => {
    const env = createMockEnv(undefined);
    const games = await fetchEpicGames(env);
    expect(games).toEqual([]);
  });

  it('should return empty array when API returns error', async () => {
    restoreFetch = mockFetch(new Response('Unauthorized', { status: 401 }));
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    expect(games).toEqual([]);
  });

  it('should return empty array when response format is unexpected', async () => {
    restoreFetch = mockFetch(new Response(JSON.stringify({ status: 'error' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    expect(games).toEqual([]);
  });

  it('should parse and normalize free games', async () => {
    const mockResponse = {
      status: 'success',
      data: {
        items: [
          {
            title: 'Test Game',
            status: 'FREE NOW',
            offer_date_range: 'Aug 28, 2026 11:00 AM UTC - Sep 4, 2026 11:00 AM UTC',
            image_url: 'https://example.com/image.jpg',
            product_url: 'https://store.epicgames.com/test-game',
            description: 'A test game description',
          },
        ],
      },
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Test Game');
    expect(games[0].platform).toBe('Epic');
    expect(games[0].source).toBe('epic');
    expect(games[0].type).toBe('base_game');
    expect(games[0].isActive).toBe(true);
    expect(games[0].storeUrl).toBe('https://store.epicgames.com/test-game');
    expect(games[0].imageUrl).toBe('https://example.com/image.jpg');
    expect(games[0].startsAt).toContain('2026-08-28');
    expect(games[0].endsAt).toContain('2026-09-04');
  });

  it('should handle COMING SOON games as not active', async () => {
    const mockResponse = {
      status: 'success',
      data: {
        items: [
          {
            title: 'Upcoming Game',
            status: 'COMING SOON',
            offer_date_range: 'Sep 10, 2026 11:00 AM UTC - Sep 17, 2026 11:00 AM UTC',
            image_url: 'https://example.com/image.jpg',
            product_url: 'https://store.epicgames.com/upcoming',
            description: 'Coming soon game',
          },
        ],
      },
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    
    expect(games).toHaveLength(1);
    expect(games[0].isActive).toBe(false); // COMING SOON not active yet
  });

  it('should skip items without title', async () => {
    const mockResponse = {
      status: 'success',
      data: {
        items: [
          { title: '', status: 'FREE NOW' },
          { title: 'Valid Game', status: 'FREE NOW', offer_date_range: 'Aug 28, 2026 11:00 AM UTC - Sep 4, 2026 11:00 AM UTC', image_url: 'https://example.com/img.jpg', product_url: 'https://store.epicgames.com/valid' },
        ],
      },
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Valid Game');
  });

  it('should handle missing offer_date_range with fallback', async () => {
    const mockResponse = {
      status: 'success',
      data: {
        items: [
          {
            title: 'Game Without Dates',
            status: 'FREE NOW',
            image_url: 'https://example.com/image.jpg',
            product_url: 'https://store.epicgames.com/no-dates',
          },
        ],
      },
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    
    expect(games).toHaveLength(1);
    expect(games[0].startsAt).toBeDefined();
    expect(games[0].endsAt).toBeDefined();
    // Should use fallback dates (now + 1 week)
  });

  it('should include raw data for debugging', async () => {
    const mockResponse = {
      status: 'success',
      data: {
        items: [
          {
            title: 'Test Game',
            status: 'FREE NOW',
            offer_date_range: 'Aug 28, 2026 11:00 AM UTC - Sep 4, 2026 11:00 AM UTC',
            image_url: 'https://example.com/image.jpg',
            product_url: 'https://store.epicgames.com/test-game',
            price_label: 'Free',
            timestamp: '2026-08-28T11:00:00Z',
          },
        ],
      },
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    
    expect(games[0].raw).toBeDefined();
    expect(games[0].raw.status).toBe('FREE NOW');
    expect(games[0].raw.offer_date_range).toBeDefined();
    expect(games[0].raw.price_label).toBe('Free');
  });

  it('should generate unique ID based on source, platform, and title', async () => {
    const mockResponse = {
      status: 'success',
      data: {
        items: [
          {
            title: 'Test Game',
            status: 'FREE NOW',
            offer_date_range: 'Aug 28, 2026 11:00 AM UTC - Sep 4, 2026 11:00 AM UTC',
            image_url: 'https://example.com/image.jpg',
            product_url: 'https://store.epicgames.com/test-game',
          },
        ],
      },
    };
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchEpicGames(env);
    
    expect(games[0].id).toContain('epic');
    expect(games[0].id).toContain('epic');
    expect(games[0].id).toContain('test-game');
  });
});