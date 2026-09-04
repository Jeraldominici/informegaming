/**
 * Unified schema for free games across all platforms
 * Matches the frontend expectations in juegos.js
 */

export type Platform = 'Epic' | 'Steam' | 'Xbox' | 'PS' | 'Nintendo' | 'Multi' | 'GOG' | 'Itchio' | 'Windows' | 'Linux' | 'macOS' | 'Android' | 'Web';
export type GameType = 'base_game' | 'dlc' | 'loot' | 'free_weekend' | 'code';
export type Source = 'epic' | 'gamerpower' | 'steamdb' | 'xbox' | 'psplus' | 'nintendo' | 'steam' | 'gog' | 'itchio' | 'battlenet' | 'ea' | 'ubisoft';
export type AvailabilityType = 'today' | 'week' | 'always';

export interface AvailabilityWindow {
  start: string;     // ISO 8601
  end: string;       // ISO 8601 (null/lejos para 'always')
  isActiveToday: boolean;
  isActiveThisWeek: boolean;
}

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
  /** ISO 8601 end date (null/lejos = 'always') */
  endsAt: string;
  /** Computed: now between startsAt and endsAt */
  isActive: boolean;
  /** Availability classification: today | week | always */
  availabilityType: AvailabilityType;
  /** Detailed availability window */
  availabilityWindow?: AvailabilityWindow;
  /** Content type */
  type: GameType;
  /** Source of data */
  source: Source;
  /** Tags for search/filtering */
  tags: string[];
  /** Original raw data for debugging */
  raw: Record<string, unknown>;
}

export interface IngestOutput {
  generatedAt: string;
  version: string;
  games: GameFree[];
  filters?: {
    types: AvailabilityType[];
    platforms: Platform[];
    total: number;
    filtered: number;
  };
}

export interface GamesQueryParams {
  type?: AvailabilityType;
  platform?: Platform;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface GamesResponse {
  generatedAt: string;
  version: string;
  games: GameFree[];
  filters: {
    types: AvailabilityType[];
    platforms: Platform[];
    total: number;
    filtered: number;
  };
}

/**
 * Search endpoint types
 */
export interface SearchQueryParams {
  q: string;
  platform?: Platform;
  type?: AvailabilityType;
  limit?: number;
}

export interface SearchResult {
  game: GameFree;
  score: number;
  matchedFields: string[];
}

export interface SearchResponse {
  generatedAt: string;
  query: string;
  results: SearchResult[];
  total: number;
  suggestions: string[];
}

/**
 * GTA 6 Section Types
 */
export type GTA6VideoType = 'trailer' | 'gameplay' | 'analysis' | 'leak' | 'news';

export interface GTA6Video {
  id: string;           // YouTube videoId
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  url: string;          // youtube.com/watch?v=
  embedUrl: string;     // youtube.com/embed/
  type: GTA6VideoType;
  isSpoiler: boolean;
  duration?: string;
  viewCount: number;
  likeCount: number;
}

export type TimelineEventType = 'announcement' | 'trailer' | 'leak' | 'rumor' | 'release';

export interface TimelineEvent {
  date: string;         // ISO 8601
  type: TimelineEventType;
  title: string;
  description: string;
  source: string;
  sourceUrl?: string;
  isConfirmed: boolean;
}

export interface GTA6Section {
  noticias: NewsArticle[];
  videos: GTA6Video[];
  timeline: TimelineEvent[];
  releaseDate?: string;
  spoilersEnabled: boolean;
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
  source: 'markdown' | 'gamerpower' | 'wordpress' | 'rss';
  raw: Record<string, unknown>;
}

export interface NewsOutput {
  generatedAt: string;
  version: string;
  noticias: NewsArticle[];
}

export interface GTA6Output {
  generatedAt: string;
  version: string;
  noticias: NewsArticle[];
  videos: GTA6Video[];
  timeline: TimelineEvent[];
  releaseDate?: string;
  spoilersEnabled: boolean;
}

export interface Env {
  KV_NAMESPACE: KVNamespace;
  PARSE_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  YOUTUBE_API_KEY?: string;
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
  is_free_to_play?: boolean;
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

export interface NormalizedGame extends Omit<GameFree, 'raw'> {
  raw: Record<string, unknown>;
}