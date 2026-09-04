/**
 * Xbox Free Play Days via Microsoft Store Recommendations API
 * Public endpoint, no auth required
 * Based on research from xbox-store-api project
 */

import type { Env, GameFree, XboxFreePlayDay, Source, AvailabilityType } from '../types';
import { 
  generateId, 
  isGameActive,
  sanitizeUrl,
  sanitizeImageUrl,
  truncateDescription,
  parseToISO,
  classifyAvailability
} from '../utils/normalize';

// Microsoft Store API endpoint for Free Play Days
// Reference: https://github.com/lucasromerodb/xbox-store-api
const XBOX_FREEPLAY_ENDPOINT = 
  'https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/api/list/collection/FreePlayDays';

interface XboxListResponse {
  Items: Array<{
    ProductId: string;
    Title: string;
    StartDate: string;
    EndDate: string;
    ProductUrl: string;
    ImageUrl?: string;
    ShortDescription?: string;
  }>;
  TotalItems: number;
}

export async function fetchXboxFreePlayDays(env: Env): Promise<GameFree[]> {
  try {
    console.log('[Xbox] Fetching Free Play Days from Microsoft Store API');
    
    const params = new URLSearchParams({
      market: 'US',
      language: 'en-us',
      itemTypes: 'Game',
      deviceFamily: 'Windows.Xbox',
      count: '200',
      skipItems: '0',
    });
    
    const url = `${XBOX_FREEPLAY_ENDPOINT}?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'informegaming/1.0',
      },
      cf: { cacheTtl: 3600 }, // Cache for 1 hour
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.warn(`[Xbox] API returned ${response.status}: ${text}`);
      return [];
    }
    
    const data = await response.json<XboxListResponse>();
    
    if (!data.Items || data.Items.length === 0) {
      console.log('[Xbox] No Free Play Days currently active');
      return [];
    }
    
    const games: GameFree[] = [];
    
    for (const item of data.Items) {
      if (!item.Title || !item.ProductId) continue;
      
      // Parse dates
      const startsAt = parseToISO(item.StartDate);
      const endsAt = parseToISO(item.EndDate);
      
      // Build store URL
      const storeUrl = item.ProductUrl || `https://www.xbox.com/en-US/games/store/${item.ProductId}`;
      
      // Image URL - Microsoft Store uses specific format
      let imageUrl = item.ImageUrl;
      if (!imageUrl) {
        // Try to construct from product ID
        imageUrl = `https://store-images.microsoft.com/image/${item.ProductId}`;
      }
      
      const game: GameFree = {
        id: generateId('xbox', item.Title, 'Xbox'),
        title: item.Title.trim(),
        platform: 'Xbox',
        storeUrl: sanitizeUrl(storeUrl),
        imageUrl: sanitizeImageUrl(imageUrl),
        description: truncateDescription(item.ShortDescription),
        startsAt,
        endsAt,
        isActive: isGameActive(startsAt, endsAt),
        availabilityType: classifyAvailability({ startsAt, endsAt }),
        type: 'free_weekend', // Free Play Days are time-limited trials
        source: 'xbox',
        tags: ['free-weekend', 'xbox', 'game-pass'],
        raw: {
          product_id: item.ProductId,
          start_date: item.StartDate,
          end_date: item.EndDate,
        },
      };
      
      games.push(game);
    }
    
    console.log(`[Xbox] Fetched ${games.length} Free Play Days`);
    return games;
    
  } catch (error) {
    console.error('[Xbox] Error fetching:', error);
    return [];
  }
}