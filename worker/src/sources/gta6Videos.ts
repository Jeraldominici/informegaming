/**
 * YouTube Data API v3 fetcher for GTA 6 videos
 * Fetches trailers, gameplay, analysis, leaks
 */

import type { Env, GTA6Video } from '../types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_SEARCH_QUERIES = [
  'GTA 6 trailer',
  'Grand Theft Auto VI trailer',
  'GTA 6 gameplay',
  'GTA 6 leak',
  'GTA 6 news',
  'Grand Theft Auto 6 analysis',
];

interface YouTubeSearchResponse {
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      description: string;
      thumbnails: { high: { url: string }; medium: { url: string }; default: { url: string } };
      channelTitle: string;
      publishedAt: string;
    };
  }>;
  pageInfo: { totalResults: number };
}

interface YouTubeVideoDetailsResponse {
  items: Array<{
    id: string;
    contentDetails: { duration: string };
    statistics: { viewCount: string; likeCount: string };
  }>;
}

export async function fetchGTA6Videos(env: Env): Promise<GTA6Video[]> {
  const apiKey = env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    console.warn('[GTA6 Videos] YOUTUBE_API_KEY not configured, skipping');
    return [];
  }
  
  try {
    console.log('[GTA6 Videos] Fetching videos from YouTube API');
    
    const allVideos: GTA6Video[] = [];
    const seenIds = new Set<string>();
    
    for (const query of YOUTUBE_SEARCH_QUERIES) {
      try {
        // Search videos
        const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
        searchUrl.searchParams.set('part', 'snippet');
        searchUrl.searchParams.set('q', query);
        searchUrl.searchParams.set('type', 'video');
        searchUrl.searchParams.set('maxResults', '10');
        searchUrl.searchParams.set('order', 'relevance');
        searchUrl.searchParams.set('key', apiKey);
        searchUrl.searchParams.set('videoEmbeddable', 'true');
        searchUrl.searchParams.set('videoSyndicated', 'true');
        
        const searchResponse = await fetch(searchUrl.toString(), {
          headers: { 'Accept': 'application/json' },
          cf: { cacheTtl: 86400 }, // Cache 24h
        });
        
        if (!searchResponse.ok) {
          console.warn(`[GTA6 Videos] Search failed for "${query}": ${searchResponse.status}`);
          continue;
        }
        
        const searchData = await searchResponse.json<YouTubeSearchResponse>();
        
        if (!searchData.items || searchData.items.length === 0) continue;
        
        // Get video IDs for details
        const videoIds = searchData.items.map(item => item.id.videoId).filter(id => !seenIds.has(id));
        if (videoIds.length === 0) continue;
        
        // Get video details (duration, stats)
        const detailsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
        detailsUrl.searchParams.set('part', 'contentDetails,statistics');
        detailsUrl.searchParams.set('id', videoIds.join(','));
        detailsUrl.searchParams.set('key', apiKey);
        
        const detailsResponse = await fetch(detailsUrl.toString(), {
          headers: { 'Accept': 'application/json' },
          cf: { cacheTtl: 86400 },
        });
        
        let detailsMap = new Map<string, { duration: string; viewCount: string; likeCount: string }>();
        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json<YouTubeVideoDetailsResponse>();
          for (const item of detailsData.items) {
            detailsMap.set(item.id, {
              duration: item.contentDetails.duration,
              viewCount: item.statistics.viewCount,
              likeCount: item.statistics.likeCount,
            });
          }
        }
        
        // Process videos
        for (const item of searchData.items) {
          const videoId = item.id.videoId;
          if (seenIds.has(videoId)) continue;
          seenIds.add(videoId);
          
          const snippet = item.snippet;
          const details = detailsMap.get(videoId) || { duration: '', viewCount: '0', likeCount: '0' };
          
          // Classify video type
          const title = snippet.title.toLowerCase();
          let type: GTA6Video['type'] = 'news';
          let isSpoiler = false;
          
          if (title.includes('trailer') || title.includes('teaser')) type = 'trailer';
          else if (title.includes('gameplay') || title.includes('walkthrough')) type = 'gameplay';
          else if (title.includes('leak') || title.includes('leaked') || title.includes('datamine')) { type = 'leak'; isSpoiler = true; }
          else if (title.includes('analysis') || title.includes('breakdown') || title.includes('review')) type = 'analysis';
          else if (title.includes('news') || title.includes('update') || title.includes('announcement')) type = 'news';
          
          // Check for spoiler keywords
          if (title.includes('spoiler') || title.includes('ending') || title.includes('story')) isSpoiler = true;
          
          const video: GTA6Video = {
            id: videoId,
            title: snippet.title,
            thumbnail: snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url,
            channelTitle: snippet.channelTitle,
            publishedAt: snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            embedUrl: `https://www.youtube.com/embed/${videoId}`,
            type,
            isSpoiler,
            duration: details.duration,
            viewCount: parseInt(details.viewCount) || 0,
            likeCount: parseInt(details.likeCount) || 0,
          };
          
          allVideos.push(video);
        }
        
      } catch (error) {
        console.error(`[GTA6 Videos] Error processing query "${query}":`, error);
      }
    }
    
    // Sort by published date (newest first)
    allVideos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    
    // Limit to 50 videos
    const limited = allVideos.slice(0, 50);
    
    console.log(`[GTA6 Videos] Fetched ${limited.length} unique videos`);
    return limited;
    
  } catch (error) {
    console.error('[GTA6 Videos] Error fetching:', error);
    return [];
  }
}