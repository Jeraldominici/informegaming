/**
 * Steam Free-to-Play games fetcher
 * Uses Steam Store API featured categories
 */

import type { Env, GameFree, Platform, GameType, Source } from '../types';
import { generateId, isGameActive, sanitizeUrl, sanitizeImageUrl, truncateDescription, parseToISO } from '../utils/normalize';

const STEAM_F2P_URL = 'https://store.steampowered.com/api/featuredcategories?l=es&cc=es';

interface SteamCategory {
  items: Array<{
    id: number;
    name: string;
    discount_block?: string;
    header_image: string;
    large_capsule_image: string;
    small_capsule_image: string;
  }>;
}

interface SteamResponse {
  specials?: SteamCategory;
  top_sellers?: SteamCategory;
  new_releases?: SteamCategory;
  free_to_play?: SteamCategory;
}

export async function fetchSteamF2P(env: Env): Promise<GameFree[]> {
  try {
    console.log('[Steam F2P] Fetching free-to-play games');
    
    const response = await fetch(STEAM_F2P_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'informegaming/1.0',
      },
      cf: { cacheTtl: 3600 },
    });
    
    if (!response.ok) {
      console.warn(`[Steam F2P] API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json<SteamResponse>();
    
    if (!data.free_to_play || !data.free_to_play.items) {
      console.warn('[Steam F2P] No free_to_play category found');
      return [];
    }
    
    const games: GameFree[] = [];
    
    for (const item of data.free_to_play.items) {
      if (!item.name) continue;
      
      // Steam F2P games are permanent
      const now = new Date();
      const farFuture = new Date('2099-12-31T23:59:59.000Z');
      
      const game: GameFree = {
        id: generateId('steam', item.name, 'Steam'),
        title: item.name.trim(),
        platform: 'Steam',
        storeUrl: sanitizeUrl(`https://store.steampowered.com/app/${item.id}`),
        imageUrl: sanitizeImageUrl(item.header_image || item.large_capsule_image || item.small_capsule_image),
        description: truncateDescription(`Free to play on Steam`),
        startsAt: now.toISOString(),
        endsAt: farFuture.toISOString(),
        isActive: true,
        availabilityType: 'always',
        type: 'base_game',
        source: 'steam',
        tags: ['free-to-play', 'steam', 'permanent'],
        raw: {
          steam_app_id: item.id,
          header_image: item.header_image,
        },
      };
      
      games.push(game);
    }
    
    console.log(`[Steam F2P] Fetched ${games.length} games`);
    return games;
    
  } catch (error) {
    console.error('[Steam F2P] Error fetching:', error);
    return [];
  }
}