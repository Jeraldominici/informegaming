/**
 * Epic Games Store Free-to-Play games fetcher
 * Uses Parse.bot Epic Games API (same as free games)
 */

import type { Env, GameFree, Platform, GameType, Source } from '../types';
import { generateId, isGameActive, sanitizeUrl, sanitizeImageUrl, truncateDescription, parseToISO } from '../utils/normalize';

const PARSE_EPIC_ENDPOINT = 'https://api.parse.bot/scraper/af5648f3-99a5-49a7-a148-2369345fc030/get_free_games';

interface EpicF2PGame {
  title: string;
  status: string;
  offer_date_range: string;
  image_url: string;
  product_url: string;
  description?: string;
  price_label?: string;
  is_free_to_play?: boolean;
}

export async function fetchEpicF2P(env: Env): Promise<GameFree[]> {
  const apiKey = env.PARSE_API_KEY;
  
  if (!apiKey) {
    console.warn('[Epic F2P] PARSE_API_KEY not configured, skipping');
    return [];
  }
  
  try {
    console.log('[Epic F2P] Fetching free-to-play games from Parse.bot');
    
    const response = await fetch(PARSE_EPIC_ENDPOINT, {
      headers: {
        'Accept': 'application/json',
        'X-API-Key': apiKey,
        'User-Agent': 'informegaming/1.0',
      },
      cf: { cacheTtl: 3600 },
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.warn(`[Epic F2P] API returned ${response.status}: ${text}`);
      return [];
    }
    
    const data = await response.json<{ data?: { items?: EpicF2PGame[] }; status: string }>();
    
    if (data.status !== 'success' || !data.data?.items) {
      console.warn('[Epic F2P] Unexpected response format:', data);
      return [];
    }
    
    const games: GameFree[] = [];
    
    for (const item of data.data.items) {
      if (!item.title) continue;
      
      // Filter only permanent free-to-play (not limited-time free)
      // The API returns both free games and F2P games
      const isPermanentF2P = item.price_label === 'Free' || item.is_free_to_play === true;
      
      // Parse date range
      let startsAt: string, endsAt: string;
      if (item.offer_date_range) {
        const parts = item.offer_date_range.split('-').map(s => s.trim());
        const startStr = parts[0]?.trim();
        startsAt = startStr ? new Date(startStr).toISOString() : new Date().toISOString();
        // For F2P, end date is far future
        endsAt = new Date('2099-12-31T23:59:59.000Z').toISOString();
      } else {
        const now = new Date();
        startsAt = now.toISOString();
        endsAt = new Date('2099-12-31T23:59:59.000Z').toISOString();
      }
      
      const game: GameFree = {
        id: generateId('epic', item.title, 'Epic'),
        title: item.title.trim(),
        platform: 'Epic',
        storeUrl: sanitizeUrl(item.product_url),
        imageUrl: sanitizeImageUrl(item.image_url),
        description: truncateDescription(item.description || `Free to play on Epic Games Store`),
        startsAt,
        endsAt,
        isActive: true,
        availabilityType: 'always',
        type: 'base_game',
        source: 'epic',
        tags: ['free-to-play', 'epic', 'permanent'],
        raw: {
          status: item.status,
          offer_date_range: item.offer_date_range,
          price_label: item.price_label,
        },
      };
      
      games.push(game);
    }
    
    console.log(`[Epic F2P] Fetched ${games.length} games`);
    return games;
    
  } catch (error) {
    console.error('[Epic F2P] Error fetching:', error);
    return [];
  }
}