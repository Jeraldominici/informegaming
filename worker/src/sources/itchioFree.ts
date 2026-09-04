/**
 * itch.io Free games fetcher
 * Uses itch.io public JSON feed
 */

import type { Env, GameFree, Platform, GameType, Source } from '../types';
import { generateId, sanitizeUrl, sanitizeImageUrl, truncateDescription } from '../utils/normalize';

const ITCHIO_FREE_URL = 'https://itch.io/games/free.json';

interface ItchioGame {
  id: number;
  title: string;
  short_text: string;
  cover_url: string;
  url: string;
  platform: string[];
  published_at: string;
  created_at: string;
}

export async function fetchItchioFree(env: Env): Promise<GameFree[]> {
  try {
    console.log('[itch.io Free] Fetching free games');
    
    const response = await fetch(ITCHIO_FREE_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'informegaming/1.0',
      },
      cf: { cacheTtl: 3600 },
    });
    
    if (!response.ok) {
      console.warn(`[itch.io Free] API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json<ItchioGame[]>();
    
    if (!data || data.length === 0) {
      console.warn('[itch.io Free] No games found');
      return [];
    }
    
    const games: GameFree[] = [];
    const farFuture = new Date('2099-12-31T23:59:59.000Z');
    
    for (const item of data) {
      if (!item.title) continue;
      
      // Determine platform from itch.io platforms
      const platforms = item.platform || [];
const primaryPlatform = platforms.includes('windows') ? 'Windows' :
                              platforms.includes('linux') ? 'Linux' :
                              platforms.includes('osx') ? 'macOS' :
                              platforms.includes('android') ? 'Android' :
                              platforms.includes('web') ? 'Web' : 'Multi';
      
      const game: GameFree = {
        id: generateId('itchio', item.title, primaryPlatform),
        title: item.title.trim(),
        platform: primaryPlatform,
        storeUrl: sanitizeUrl(item.url),
        imageUrl: sanitizeImageUrl(item.cover_url),
        description: truncateDescription(item.short_text || `Free on itch.io`),
        startsAt: item.published_at ? new Date(item.published_at).toISOString() : new Date().toISOString(),
        endsAt: new Date('2099-12-31T23:59:59.000Z').toISOString(),
        isActive: true,
        availabilityType: 'always',
        type: 'base_game',
        source: 'itchio',
        tags: ['free', 'itchio', 'indie', 'permanent', ...platforms.map(p => p.toLowerCase())],
        raw: {
          itchio_id: item.id,
          platforms: item.platform,
        },
      };
      
      games.push(game);
    }
    
    console.log(`[itch.io Free] Fetched ${games.length} games`);
    return games;
    
  } catch (error) {
    console.error('[itch.io Free] Error fetching:', error);
    return [];
  }
}