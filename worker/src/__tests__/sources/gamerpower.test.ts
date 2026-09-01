/**
 * Tests for GamerPower source
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGamerPower } from '../sources/gamerpower';

// Mock fetch globally
const mockFetch = (response: Response) => {
  const originalFetch = global.fetch;
  global.fetch = vi.fn().mockResolvedValue(response.clone());
  return () => { global.fetch = originalFetch; };
};

const createMockEnv = () => ({});

describe('fetchGamerPower', () => {
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
    const games = await fetchGamerPower(env);
    expect(games).toEqual([]);
  });

  it('should filter only Active status games', async () => {
    const mockResponse = [
      { id: 1, title: 'Active Game', status: 'Active', type: 'Game', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/active.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/active', gamerpower_url: 'https://gamerpower.com/active', worth: 'Free', description: 'Active game', instructions: 'Claim now', users: 100 },
      { id: 2, title: 'Inactive Game', status: 'Expired', type: 'Game', platforms: 'PC', end_date: '2026-08-01', published_date: '2026-07-28', image: 'https://example.com/inactive.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/inactive', gamerpower_url: 'https://gamerpower.com/inactive', worth: 'Free', description: 'Inactive game', instructions: 'Expired', users: 50 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Active Game');
  });

  it('should filter only Game/DLC/Beta/Early Access types', async () => {
    const mockResponse = [
      { id: 1, title: 'Game', status: 'Active', type: 'Game', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/game.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Game', instructions: 'Claim', users: 100 },
      { id: 2, title: 'DLC', status: 'Active', type: 'DLC', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/dlc.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/dlc', gamerpower_url: 'https://gamerpower.com/dlc', worth: 'Free', description: 'DLC', instructions: 'Claim', users: 100 },
      { id: 3, title: 'Beta', status: 'Active', type: 'Beta', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/beta.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/beta', gamerpower_url: 'https://gamerpower.com/beta', worth: 'Free', description: 'Beta', instructions: 'Claim', users: 100 },
      { id: 4, title: 'Other', status: 'Active', type: 'Other', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/other.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/other', gamerpower_url: 'https://gamerpower.com/other', worth: 'Free', description: 'Other', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games).toHaveLength(3); // Game, DLC, Beta (not Other)
  });

  it('should parse dates correctly', async () => {
    const mockResponse = [
      { id: 1, title: 'Test Game', status: 'Active', type: 'Game', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games[0].startsAt).toContain('2026-08-28');
    expect(games[0].endsAt).toContain('2026-09-01');
  });

  it('should use far future date for N/A end_date', async () => {
    const mockResponse = [
      { id: 1, title: 'No End Date', status: 'Active', type: 'Game', platforms: 'PC', end_date: 'N/A', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games[0].endsAt).toBe('2099-12-31T23:59:59.000Z');
  });

  it('should normalize platform correctly', async () => {
    const mockResponse = [
      { id: 1, title: 'Epic Game', status: 'Active', type: 'Game', platforms: 'Epic Games Store', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
      { id: 2, title: 'Steam Game', status: 'Active', type: 'Game', platforms: 'Steam', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
      { id: 3, title: 'Xbox Game', status: 'Active', type: 'Game', platforms: 'Xbox One', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env);
    
    expect(games[0].platform).toBe('Epic');
    expect(games[1].platform).toBe('Steam');
    expect(games[2].platform).toBe('Xbox');
  });

  it('should handle multi-platform games', async () => {
    const mockResponse = [
      { id: 1, title: 'Multi Game', status: 'Active', type: 'Game', platforms: 'Epic Games Store, Steam, Xbox One', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env);
    
    // Should pick first non-Multi platform
    expect(games[0].platform).toBe('Epic');
  });

  it('should sanitize URLs', async () => {
    const mockResponse = [
      { id: 1, title: 'Test', status: 'Active', type: 'Game', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'not-a-url', thumbnail: '', open_giveaway_url: 'javascript:alert(1)', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games[0].imageUrl).toContain('placeholder.com');
    expect(games[0].storeUrl).toBe('https://gamerpower.com/game');
  });

  it('should use gamerpower_url as fallback for storeUrl', async () => {
    const mockResponse = [
      { id: 1, title: 'Test', status: 'Active', type: 'Game', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: '', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games[0].storeUrl).toBe('https://gamerpower.com/game');
  });

  it('should include raw data with gamerpower_id', async () => {
    const mockResponse = [
      { id: 12345, title: 'Test Game', status: 'Active', type: 'Game', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games[0].raw.gamerpower_id).toBe(12345);
    expect(games[0].raw.worth).toBe('Free');
    expect(games[0].raw.platforms).toBe('PC');
  });

  it('should generate unique ID', async () => {
    const mockResponse = [
      { id: 1, title: 'Test Game', status: 'Active', type: 'Game', platforms: 'PC', end_date: '2026-09-01', published_date: '2026-08-28', image: 'https://example.com/img.jpg', thumbnail: '', open_giveaway_url: 'https://example.com/game', gamerpower_url: 'https://gamerpower.com/game', worth: 'Free', description: 'Test', instructions: 'Claim', users: 100 },
    ];
    
    restoreFetch = mockFetch(new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const env = createMockEnv();
    const games = await fetchGamerPower(env, 'Epic');
    
    expect(games[0].id).toContain('gamerpower');
    expect(games[0].id).toContain('epic');
    expect(games[0].id).toContain('test-game');
  });
});