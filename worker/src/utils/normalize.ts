/**
 * Utility functions for data normalization and processing
 */

import type { GameFree, GameType, Platform, Source, NormalizedGame } from '../types';

/**
 * Normalize platform string to our standard Platform type
 */
export function normalizePlatform(platform: string): Platform {
  const p = platform.toLowerCase().trim();
  
  if (p.includes('epic')) return 'Epic';
  if (p.includes('steam')) return 'Steam';
  if (p.includes('xbox') || p.includes('microsoft')) return 'Xbox';
  if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5') || p === 'ps') return 'PS';
  if (p.includes('nintendo') || p.includes('switch') || p.includes('eshop')) return 'Nintendo';
  
  // Multi-platform
  if (p.includes('pc') && (p.includes('playstation') || p.includes('xbox') || p.includes('nintendo'))) {
    return 'Multi';
  }
  
  return 'Multi';
}

/**
 * Normalize game type from source data
 */
export function normalizeType(type: string, platform: Platform): GameType {
  const t = type.toLowerCase().trim();
  
  if (t.includes('dlc') || t.includes('add-on') || t.includes('expansion') || t.includes('pack') || t.includes('skin') || t.includes('item') || t.includes('currency') || t.includes('key') || t.includes('code') || t.includes('booster')) {
    return 'dlc';
  }
  if (t.includes('loot') || t.includes('drop') || t.includes('reward') || t.includes('bundle') || t.includes('pack')) {
    return 'loot';
  }
  if (t.includes('free weekend') || t.includes('free week') || t.includes('trial') || t.includes('playtest')) {
    return 'free_weekend';
  }
  if (t === 'game' || t === 'base game' || t === 'full game') {
    return 'base_game';
  }
  if (t === 'early access' || t === 'beta' || t === 'alpha') {
    return 'free_weekend';
  }
  
  // Default: if it's a free game on Epic, it's a base game
  if (platform === 'Epic') return 'base_game';
  
  return 'dlc';
}

/**
 * Parse various date formats to ISO 8601 UTC string
 */
export function parseToISO(dateStr: string | undefined | null): string {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'null' || dateStr === 'undefined') {
    // Return far future date as fallback
    return new Date('2099-12-31T23:59:59.000Z').toISOString();
  }
  
  // Try parsing as-is
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  
  // Try common formats
  const formats = [
    /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/, // 2026-08-28 11:18:37
    /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
    /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
  ];
  
  for (const fmt of formats) {
    const match = dateStr.match(fmt);
    if (match) {
      const parsed = new Date(match[0]);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }
  
  // Epic Games offer_date_range format: "Aug 28, 2026 11:00 AM UTC - Sep 4, 2026 11:00 AM UTC"
  const epicRange = dateStr.match(/([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M UTC)/);
  if (epicRange && epicRange[1]) {
    const parsed = new Date(epicRange[1]);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  
  console.warn(`[normalize] Could not parse date: ${dateStr}, using far future`);
  return new Date('2099-12-31T23:59:59.000Z').toISOString();
}

/**
 * Extract start and end dates from Epic's offer_date_range
 * Format: "Aug 28, 2026 11:00 AM UTC - Sep 4, 2026 11:00 AM UTC"
 */
export function parseEpicDateRange(range: string): { start: string; end: string } {
  const parts = range.split('-').map(s => s.trim());
  return {
    start: parseToISO(parts[0]),
    end: parseToISO(parts[1] || parts[0]),
  };
}

/**
 * Generate unique ID for deduplication
 */
export function generateId(source: Source, title: string, platform: Platform): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${source}:${platform.toLowerCase()}:${normalized}`;
}

/**
 * Check if a game is currently active
 */
export function isGameActive(startsAt: string, endsAt: string): boolean {
  const now = new Date();
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return now >= start && now <= end;
}

/**
 * Deduplicate games by ID, keeping the one with earliest start date
 */
export function deduplicateGames(games: NormalizedGame[]): NormalizedGame[] {
  const map = new Map<string, NormalizedGame>();
  
  for (const game of games) {
    const existing = map.get(game.id);
    if (!existing) {
      map.set(game.id, game);
    } else {
      // Keep the one with earlier start date (more authoritative)
      const existingStart = new Date(existing.startsAt).getTime();
      const newStart = new Date(game.startsAt).getTime();
      if (newStart < existingStart) {
        map.set(game.id, game);
      }
    }
  }
  
  // Sort by start date ascending
  return Array.from(map.values()).sort((a, b) => 
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string | undefined | null): string {
  if (!url) return '#';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
  } catch {
    // Ignore invalid URLs
  }
  return '#';
}

/**
 * Sanitize image URL
 */
export function sanitizeImageUrl(url: string | undefined | null): string {
  if (!url) return 'https://via.placeholder.com/300x160/1f2937/00ffcc?text=No+Image';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
  } catch {
    // Ignore invalid URLs
  }
  return 'https://via.placeholder.com/300x160/1f2937/00ffcc?text=No+Image';
}

/**
 * Truncate description to max length
 */
export function truncateDescription(desc: string | undefined, max = 200): string {
  if (!desc) return '';
  const cleaned = desc.replace(/<[^>]*>/g, '').trim(); // Strip HTML
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd() + '…';
}