/**
 * GamerPower API source fetcher
 * Free, no auth required, CORS OK
 */

import type { Env, GameFree, GamerPowerGiveaway, Platform, Source, AvailabilityType } from '../types';
import { 
  normalizePlatform, 
  normalizeType, 
  parseToISO, 
  generateId, 
  isGameActive,
  sanitizeUrl,
  sanitizeImageUrl,
  truncateDescription,
  classifyAvailability
} from '../utils/normalize';

// Platform mapping for GamerPower API
const PLATFORM_MAP: Record<string, string> = {
  'Epic': 'epic-games-store',
  'Steam': 'steam',
  'Xbox': 'xbox-one',
  'PS': 'ps4',
  'Nintendo': 'switch',
  'Multi': '',
};

export async function fetchGamerPower(env: Env, platform?: Platform): Promise<GameFree[]> {
  const games: GameFree[] = [];
  const platformsToFetch = platform ? [platform] : ['Epic', 'Steam', 'Xbox', 'PS', 'Nintendo'] as Platform[];
  
  for (const p of platformsToFetch) {
    try {
      const gpPlatform = PLATFORM_MAP[p];
      const url = gpPlatform 
        ? `https://www.gamerpower.com/api/giveaways?platform=${gpPlatform}`
        : 'https://www.gamerpower.com/api/giveaways';
      
      console.log(`[GamerPower] Fetching ${p} from ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'informegaming/1.0',
        },
        cf: { cacheTtl: 3600 }, // Cache for 1 hour
      });
      
      if (!response.ok) {
        console.warn(`[GamerPower] ${p} returned ${response.status}`);
        continue;
      }
      
      const data = await response.json<GamerPowerGiveaway[]>();
      console.log(`[GamerPower] ${p}: ${data.length} items`);
      
      for (const item of data) {
        // Filter: only Active status, only Game or DLC types (skip Other, Early Access, etc.)
        if (item.status !== 'Active') continue;
        if (!['Game', 'DLC', 'Beta', 'Early Access'].includes(item.type)) continue;
        
        // Parse dates
        const published = parseToISO(item.published_date);
        const endsAt = item.end_date && item.end_date !== 'N/A' 
          ? parseToISO(item.end_date)
          : new Date('2099-12-31T23:59:59.000Z').toISOString();
        
        // Determine platform from item.platforms (may contain multiple)
        const itemPlatforms = item.platforms.split(',').map(s => s.trim());
        const primaryPlatform = itemPlatforms
          .map(normalizePlatform)
          .find(plat => plat !== 'Multi') || normalizePlatform(itemPlatforms[0] || 'PC');
        
        const game: GameFree = {
          id: generateId('gamerpower', item.title, primaryPlatform),
          title: item.title.trim(),
          platform: primaryPlatform,
          storeUrl: sanitizeUrl(item.open_giveaway_url || item.gamerpower_url),
          imageUrl: sanitizeImageUrl(item.image || item.thumbnail),
          description: truncateDescription(item.description),
          startsAt: published,
          endsAt,
          isActive: isGameActive(published, endsAt),
          availabilityType: classifyAvailability({ startsAt: published, endsAt }),
          type: normalizeType(item.type, primaryPlatform),
          source: 'gamerpower',
          tags: [primaryPlatform.toLowerCase(), 'gamerpower', item.type.toLowerCase()],
          raw: {
            gamerpower_id: item.id,
            worth: item.worth,
            platforms: item.platforms,
            users: item.users,
            instructions: item.instructions,
            gamerpower_url: item.gamerpower_url,
          },
        };
        
        games.push(game);
      }
    } catch (error) {
      console.error(`[GamerPower] Error fetching ${p}:`, error);
    }
  }
  
  return games;
}