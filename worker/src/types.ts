/**
 * Unified schema for free games across all platforms
 * Matches the frontend expectations in juegos.js
 */

export type Platform = 'Epic' | 'Steam' | 'Xbox' | 'PS' | 'Nintendo' | 'Multi';
export type GameType = 'base_game' | 'dlc' | 'loot' | 'free_weekend' | 'code';
export type Source = 'epic' | 'gamerpower' | 'steamdb' | 'xbox' | 'psplus' | 'nintendo';

export interface GameFree {
  /** Unique identifier: source:normalized-title */
  id: string;
  /** Game title */
  title: string;
  /** Primary platform for filtering */
  platform: Platform;
  /** Direct store/claim URL */
  storeUrl: string;
  /** High-res image URL for card */
  imageUrl: string;
  /** Short description */
  description?: string;
  /** ISO 8601 start date */
  startsAt: string;
  /** ISO 8601 end date */
  endsAt: string;
  /** Computed: now between startsAt and endsAt */
  isActive: boolean;
  /** Content type */
  type: GameType;
  /** Source of data */
  source: Source;
  /** Original raw data for debugging */
  raw: Record<string, unknown>;
}

export interface IngestOutput {
  generatedAt: string;
  version: string;
  games: GameFree[];
}

/**
 * News Article schema (Markdown-based)
 */
export interface NewsArticle {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  image?: string;
  url?: string;
  categories: string[];
  tags: string[];
  author?: string;
  source: 'markdown';
  raw: Record<string, unknown>;
}

export interface NewsOutput {
  generatedAt: string;
  version: string;
  noticias: NewsArticle[];
}

export interface Env {
  KV_NAMESPACE: KVNamespace;
  PARSE_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
}

// Source-specific raw types
export interface GamerPowerGiveaway {
  id: number;
  title: string;
  worth: string;
  thumbnail: string;
  image: string;
  description: string;
  instructions: string;
  open_giveaway_url: string;
  published_date: string;
  type: string;
  platforms: string;
  end_date: string;
  users: number;
  status: string;
  gamerpower_url: string;
  open_giveaway: string;
}

export interface EpicFreeGame {
  title: string;
  status: 'FREE NOW' | 'COMING SOON';
  offer_date_range: string;
  image_url: string;
  product_url: string;
  description?: string;
  price_label?: string;
  timestamp?: string;
}

export interface XboxFreePlayDay {
  ProductId: string;
  Title: string;
  StartDate: string;
  EndDate: string;
  ProductUrl: string;
  ImageUrl?: string;
  Description?: string;
}

// Health check types
export interface HealthCheckResult {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  message?: string;
  durationMs: number;
}

export interface HealthOutput {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  checks: Record<string, HealthCheckResult>;
  lastIngest?: string;
}

export interface NormalizedGame extends Omit<GameFree, 'raw'> {
  raw: Record<string, unknown>;
}