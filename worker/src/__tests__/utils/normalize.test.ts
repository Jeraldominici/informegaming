/**
 * Tests for normalize utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizePlatform,
  normalizeType,
  parseToISO,
  parseEpicDateRange,
  generateId,
  isGameActive,
  deduplicateGames,
  sanitizeUrl,
  sanitizeImageUrl,
  truncateDescription,
} from '../../utils/normalize';

describe('normalizePlatform', () => {
  it('should normalize epic variations', () => {
    expect(normalizePlatform('epic')).toBe('Epic');
    expect(normalizePlatform('Epic Games')).toBe('Epic');
    expect(normalizePlatform('epic-games-store')).toBe('Epic');
  });

  it('should normalize steam variations', () => {
    expect(normalizePlatform('steam')).toBe('Steam');
    expect(normalizePlatform('Steam')).toBe('Steam');
  });

  it('should normalize xbox variations', () => {
    expect(normalizePlatform('xbox')).toBe('Xbox');
    expect(normalizePlatform('microsoft')).toBe('Xbox');
    expect(normalizePlatform('Xbox One')).toBe('Xbox');
  });

  it('should normalize playstation variations', () => {
    expect(normalizePlatform('playstation')).toBe('PS');
    expect(normalizePlatform('ps4')).toBe('PS');
    expect(normalizePlatform('ps5')).toBe('PS');
    expect(normalizePlatform('PS')).toBe('PS');
  });

  it('should normalize nintendo variations', () => {
    expect(normalizePlatform('nintendo')).toBe('Nintendo');
    expect(normalizePlatform('switch')).toBe('Nintendo');
    expect(normalizePlatform('eshop')).toBe('Nintendo');
  });

  it('should handle multi-platform', () => {
    expect(normalizePlatform('pc, playstation, xbox')).toBe('Multi');
  });

  it('should default to Multi for unknown', () => {
    expect(normalizePlatform('unknown')).toBe('Multi');
    expect(normalizePlatform('')).toBe('Multi');
  });
});

describe('normalizeType', () => {
  it('should identify DLC', () => {
    expect(normalizeType('DLC', 'Epic')).toBe('dlc');
    expect(normalizeType('Add-on', 'Steam')).toBe('dlc');
    expect(normalizeType('Expansion', 'PS')).toBe('dlc');
    expect(normalizeType('Skin', 'Xbox')).toBe('dlc');
    expect(normalizeType('Currency', 'Nintendo')).toBe('dlc');
  });

  it('should identify loot', () => {
    expect(normalizeType('Loot', 'Epic')).toBe('loot');
    expect(normalizeType('Drop', 'Steam')).toBe('loot');
    expect(normalizeType('Reward', 'PS')).toBe('loot');
  });

  it('should identify free_weekend', () => {
    expect(normalizeType('Free Weekend', 'Epic')).toBe('free_weekend');
    expect(normalizeType('Free Week', 'Steam')).toBe('free_weekend');
    expect(normalizeType('Trial', 'PS')).toBe('free_weekend');
    expect(normalizeType('Playtest', 'Xbox')).toBe('free_weekend');
  });

  it('should identify base_game', () => {
    expect(normalizeType('Game', 'Epic')).toBe('base_game');
    expect(normalizeType('Base Game', 'Steam')).toBe('base_game');
    expect(normalizeType('Full Game', 'PS')).toBe('base_game');
  });

  it('should handle early access/beta as free_weekend', () => {
    expect(normalizeType('Early Access', 'Epic')).toBe('free_weekend');
    expect(normalizeType('Beta', 'Steam')).toBe('free_weekend');
    expect(normalizeType('Alpha', 'PS')).toBe('free_weekend');
  });

  it('should default to dlc for unknown types', () => {
    expect(normalizeType('Unknown', 'Epic')).toBe('dlc');
  });

  it('should default to base_game for Epic platform', () => {
    expect(normalizeType('Some Type', 'Epic')).toBe('base_game');
  });
});

describe('parseToISO', () => {
  it('should parse standard ISO dates', () => {
    const result = parseToISO('2026-08-28T15:00:00.000Z');
    expect(result).toBe('2026-08-28T15:00:00.000Z');
  });

  it('should parse date-only strings', () => {
    const result = parseToISO('2026-08-28');
    expect(result).toContain('2026-08-28');
  });

  it('should parse MM/DD/YYYY format', () => {
    const result = parseToISO('08/28/2026');
    expect(result).toContain('2026-08-28');
  });

  it('should parse datetime with space', () => {
    const result = parseToISO('2026-08-28 11:18:37');
    expect(result).toContain('2026-08-28');
  });

  it('should parse Epic date range format', () => {
    const result = parseToISO('Aug 28, 2026 11:00 AM UTC');
    expect(result).toContain('2026-08-28');
  });

  it('should return far future for invalid/empty dates', () => {
    expect(parseToISO('')).toBe('2099-12-31T23:59:59.000Z');
    expect(parseToISO('N/A')).toBe('2099-12-31T23:59:59.000Z');
    expect(parseToISO('null')).toBe('2099-12-31T23:59:59.000Z');
    expect(parseToISO('undefined')).toBe('2099-12-31T23:59:59.000Z');
    expect(parseToISO('invalid')).toBe('2099-12-31T23:59:59.000Z');
  });

  it('should handle null/undefined', () => {
    expect(parseToISO(null as any)).toBe('2099-12-31T23:59:59.000Z');
    expect(parseToISO(undefined as any)).toBe('2099-12-31T23:59:59.000Z');
  });
});

describe('parseEpicDateRange', () => {
  it('should parse start and end dates', () => {
    const result = parseEpicDateRange('Aug 28, 2026 11:00 AM UTC - Sep 4, 2026 11:00 AM UTC');
    expect(result.start).toContain('2026-08-28');
    expect(result.end).toContain('2026-09-04');
  });

  it('should handle single date (fallback)', () => {
    const result = parseEpicDateRange('Aug 28, 2026 11:00 AM UTC');
    expect(result.start).toContain('2026-08-28');
    expect(result.end).toContain('2026-08-28');
  });
});

describe('generateId', () => {
  it('should generate consistent IDs', () => {
    const id1 = generateId('epic', 'Test Game', 'Epic');
    const id2 = generateId('epic', 'Test Game', 'Epic');
    expect(id1).toBe(id2);
  });

  it('should include source, platform, and normalized title', () => {
    const id = generateId('gamerpower', 'My Awesome Game!', 'Steam');
    expect(id).toContain('gamerpower');
    expect(id).toContain('steam');
    expect(id).toContain('my-awesome-game');
  });

  it('should handle special characters', () => {
    const id = generateId('epic', 'Game: Title (Special)', 'Epic');
    expect(id).toBe('epic:epic:game-title-special');
  });
});

describe('isGameActive', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 86400000).toISOString(); // 1 day ago
  const future = new Date(now.getTime() + 86400000).toISOString(); // 1 day from now
  const farFuture = new Date(now.getTime() + 86400000 * 10).toISOString(); // 10 days from now

  it('should return true for active games', () => {
    expect(isGameActive(past, future)).toBe(true);
  });

  it('should return false for expired games', () => {
    const pastEnd = new Date(now.getTime() - 86400000).toISOString();
    expect(isGameActive(past, pastEnd)).toBe(false);
  });

  it('should return false for future games', () => {
    const futureStart = new Date(now.getTime() + 86400000).toISOString();
    expect(isGameActive(futureStart, farFuture)).toBe(false);
  });

  it('should handle edge case: starts exactly now', () => {
    expect(isGameActive(now.toISOString(), future)).toBe(true);
  });

  it('should handle edge case: ends exactly now', () => {
    expect(isGameActive(past, now.toISOString())).toBe(false);
  });
});

describe('deduplicateGames', () => {
  const baseGame = {
    id: 'test:epic:game',
    title: 'Test Game',
    platform: 'Epic' as const,
    storeUrl: 'https://example.com',
    imageUrl: 'https://example.com/img.jpg',
    startsAt: '2026-08-28T15:00:00.000Z',
    endsAt: '2026-09-04T15:00:00.000Z',
    isActive: true,
    type: 'base_game' as const,
    source: 'epic' as const,
    raw: {},
  };

  it('should remove exact duplicates by ID', () => {
    const games = [baseGame, { ...baseGame, raw: { different: 'raw' } }];
    const result = deduplicateGames(games);
    expect(result).toHaveLength(1);
  });

  it('should keep earliest start date for duplicates', () => {
    const earlier = { ...baseGame, startsAt: '2026-08-25T15:00:00.000Z' };
    const later = { ...baseGame, startsAt: '2026-08-28T15:00:00.000Z' };
    const result = deduplicateGames([later, earlier]);
    expect(result).toHaveLength(1);
    expect(result[0].startsAt).toBe('2026-08-25T15:00:00.000Z');
  });

  it('should not deduplicate different platforms', () => {
    const epicGame = { ...baseGame, platform: 'Epic' as const, id: 'epic:epic:game' };
    const steamGame = { ...baseGame, platform: 'Steam' as const, id: 'steam:steam:game' };
    const result = deduplicateGames([epicGame, steamGame]);
    expect(result).toHaveLength(2);
  });

  it('should sort by start date ascending', () => {
    const game1 = { ...baseGame, id: '1', startsAt: '2026-09-01T00:00:00.000Z' };
    const game2 = { ...baseGame, id: '2', startsAt: '2026-08-01T00:00:00.000Z' };
    const result = deduplicateGames([game1, game2]);
    expect(result[0].id).toBe('2');
    expect(result[1].id).toBe('1');
  });

  it('should handle empty array', () => {
    expect(deduplicateGames([])).toEqual([]);
  });
});

describe('sanitizeUrl', () => {
  it('should return valid URLs unchanged', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    expect(sanitizeUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
  });

  it('should return # for invalid URLs', () => {
    expect(sanitizeUrl('')).toBe('#');
    expect(sanitizeUrl('not-a-url')).toBe('#');
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
    expect(sanitizeUrl('ftp://example.com')).toBe('#');
  });

  it('should return # for null/undefined', () => {
    expect(sanitizeUrl(null as any)).toBe('#');
    expect(sanitizeUrl(undefined as any)).toBe('#');
  });
});

describe('sanitizeImageUrl', () => {
  it('should return valid URLs unchanged', () => {
    expect(sanitizeImageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
    expect(sanitizeImageUrl('http://example.com/img.png')).toBe('http://example.com/img.png');
  });

  it('should return placeholder for invalid/empty', () => {
    const placeholder = 'https://via.placeholder.com/300x160/1f2937/00ffcc?text=No+Image';
    expect(sanitizeImageUrl('')).toBe(placeholder);
    expect(sanitizeImageUrl('invalid')).toBe(placeholder);
    expect(sanitizeImageUrl(null as any)).toBe(placeholder);
  });
});

describe('truncateDescription', () => {
  it('should return empty string for empty input', () => {
    expect(truncateDescription('')).toBe('');
    expect(truncateDescription(undefined as any)).toBe('');
  });

  it('should strip HTML tags', () => {
    expect(truncateDescription('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    expect(truncateDescription('<div><span>Test</span></div>')).toBe('Test');
  });

  it('should truncate at max length', () => {
    const longText = 'a'.repeat(300);
    const result = truncateDescription(longText, 100);
    expect(result.length).toBe(101); // 100 + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  it('should not truncate if under max', () => {
    expect(truncateDescription('Short text', 100)).toBe('Short text');
  });

  it('should trim whitespace', () => {
    expect(truncateDescription('  Hello  ')).toBe('Hello');
  });
});