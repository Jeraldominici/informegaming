/**
 * Epic Games Store free games via Parse.bot API
 * Requires PARSE_API_KEY (free tier: 200 calls/month)
 * Endpoint: get_free_games returns current + upcoming with dates
 */

import type { Env, GameFree, EpicFreeGame, Source, AvailabilityType } from '../types';
import { 
  generateId, 
  isGameActive,
  sanitizeUrl,
  sanitizeImageUrl,
  truncateDescription,
  parseEpicDateRange,
  parseToISO,
  normalizeType,
  classifyAvailability
} from '../utils/normalize';

const PARSE_EPIC_ENDPOINT = 'https://api.parse.bot/scraper/af5648f3-99a5-49a7-a148-2369345fc030/get_free_games';

export async function fetchEpicGames(env: Env): Promise<GameFree[]> {
  const apiKey = env.PARSE_API_KEY;
  
  if (!apiKey) {
    console.warn('[Epic] PARSE_API_KEY not configured, skipping');
    return [];
  }
  
  try {
    console.log('[Epic] Fetching free games from Parse.bot');
    
    const response = await fetch(PARSE_EPIC_ENDPOINT, {
      headers: {
        'Accept': 'application/json',
        'X-API-Key': apiKey,
        'User-Agent': 'informegaming/1.0',
      },
      cf: { cacheTtl: 3600 }, // Cache for 1 hour
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.warn(`[Epic] API returned ${response.status}: ${text}`);
      return [];
    }
    
    const data = await response.json<{ data?: { items?: EpicFreeGame[] }; status: string }>();
    
    if (data.status !== 'success' || !data.data?.items) {
      console.warn('[Epic] Unexpected response format:', data);
      return [];
    }
    
    const games: GameFree[] = [];
    
    for (const item of data.data.items) {
      // Skip if no title
      if (!item.title) continue;
      
      // Parse date range
      let startsAt: string, endsAt: string;
      if (item.offer_date_range) {
        const parsed = parseEpicDateRange(item.offer_date_range);
        startsAt = parsed.start;
        endsAt = parsed.end;
      } else {
        // Fallback
        const now = new Date();
        startsAt = now.toISOString();
        endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week
      }
      
      // Determine type from status
      const isFreeNow = item.status === 'FREE NOW';
      const type = isFreeNow ? 'base_game' : 'base_game'; // Epic free games are base games
      
      // Determine availability type
      const availabilityType: AvailabilityType = classifyAvailability({ startsAt, endsAt });
      
      const game: GameFree = {
        id: generateId('epic', item.title, 'Epic'),
        title: item.title.trim(),
        platform: 'Epic',
        storeUrl: sanitizeUrl(item.product_url),
        imageUrl: sanitizeImageUrl(item.image_url),
        description: truncateDescription(item.description),
        startsAt,
        endsAt,
        isActive: isFreeNow ? isGameActive(startsAt, endsAt) : false, // COMING SOON not active yet
        availabilityType,
        type,
        source: 'epic',
        tags: ['free', 'epic', availabilityType],
        raw: {
          status: item.status,
          offer_date_range: item.offer_date_range,
          price_label: item.price_label,
          timestamp: item.timestamp,
        },
      };
      
      games.push(game);
    }
    
    console.log(`[Epic] Fetched ${games.length} games`);
    return games;
    
  } catch (error) {
    console.error('[Epic] Error fetching:', error);
    return [];
  }
}