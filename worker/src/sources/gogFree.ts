/**
 * GOG.com Free games fetcher
 * Uses GOG public API
 */

import type { Env, GameFree, Platform, GameType, Source } from '../types';
import { generateId, sanitizeUrl, sanitizeImageUrl, truncateDescription } from '../utils/normalize';

const GOG_FREE_URL = 'https://www.gog.com/games/ajax/filtered?mediaType=game&price=free&page=1&sort=bestselling';

interface GOGGame {
  id: number;
  title: string;
  slug: string;
  image: string;
  price: {
    amount: string;
    baseAmount: string;
    currency: string;
    isFree: boolean;
  };
  links: {
    productCard: string;
  };
}

interface GOGResponse {
  products: GOGGame[];
  totalGames: number;
  page: number;
  totalPages: number;
}

export async function fetchGOGFree(env: Env): Promise<GameFree[]> {
  try {
    console.log('[GOG Free] Fetching free games');
    
    const response = await fetch(GOG_FREE_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'informegaming/1.0',
      },
      cf: { cacheTtl: 3600 },
    });
    
    if (!response.ok) {
      console.warn(`[GOG Free] API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json<GOGResponse>();
    
    if (!data.products || data.products.length === 0) {
      console.warn('[GOG Free] No products found');
      return [];
    }
    
    const games: GameFree[] = [];
    const now = new Date();
    const farFuture = new Date('2099-12-31T23:59:59.000Z');
    
    for (const item of data.products) {
      if (!item.title || !item.price?.isFree) continue;
      
      const game: GameFree = {
        id: generateId('gog', item.title, 'GOG'),
        title: item.title.trim(),
        platform: 'GOG',
        storeUrl: sanitizeUrl(`https://www.gog.com${item.links.productCard}`),
        imageUrl: sanitizeImageUrl(item.image),
        description: truncateDescription(`Free on GOG.com`),
        startsAt: now.toISOString(),
        endsAt: new Date('2099-12-31T23:59:59.000Z').toISOString(),
        isActive: true,
        availabilityType: 'always',
        type: 'base_game',
        source: 'gog',
        tags: ['free', 'gog', 'permanent', 'drm-free'],
        raw: {
          gog_id: item.id,
          slug: item.slug,
        },
      };
      
      games.push(game);
    }
    
    console.log(`[GOG Free] Fetched ${games.length} games`);
    return games;
    
  } catch (error) {
    console.error('[GOG Free] Error fetching:', error);
    return [];
  }
}