/**
 * GTA 6 News fetcher - filters noticias for GTA 6 content
 * Also fetches from GamerPower with GTA 6 filter
 */

import type { Env, NewsArticle, NewsOutput } from '../types';
import { parseToISO, sanitizeUrl, sanitizeImageUrl, truncateDescription } from '../utils/normalize';

const GAMERPOWER_GTA6_URL = 'https://www.gamerpower.com/api/giveaways?platform=pc';

interface GamerPowerItem {
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

export async function fetchGTA6News(env: Env): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];
  
  // 1. Fetch from GamerPower (might have GTA 6 related content)
  try {
    const response = await fetch(GAMERPOWER_GTA6_URL, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'informegaming/1.0' },
      cf: { cacheTtl: 3600 },
    });
    
    if (response.ok) {
      const data = await response.json<GamerPowerItem[]>();
      
      for (const item of data) {
        if (!item.title.toLowerCase().includes('gta 6') && 
            !item.title.toLowerCase().includes('grand theft auto vi') &&
            !item.title.toLowerCase().includes('grand theft auto 6')) {
          continue;
        }
        
        const published = parseToISO(item.published_date);
        
        const article: NewsArticle = {
          id: `gamerpower:${item.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}:gta6`,
          title: item.title.trim(),
          excerpt: truncateDescription(item.description),
          content: item.description,
          date: published,
          image: sanitizeImageUrl(item.image || item.thumbnail),
          url: sanitizeUrl(item.open_giveaway_url || item.gamerpower_url),
          categories: ['GTA 6', 'Gaming', 'News'],
          tags: ['gta6', 'grand-theft-auto-vi', 'rockstar'],
          author: 'GamerPower',
          source: 'gamerpower',
          raw: {
            gamerpower_id: item.id,
            worth: item.worth,
            platforms: item.platforms,
            end_date: item.end_date,
          },
        };
        
        articles.push(article);
      }
    }
  } catch (error) {
    console.error('[GTA6 News] GamerPower fetch error:', error);
  }
  
  // 2. Try WordPress JSON Feed for GTA 6 content
  try {
    const wpResponse = await fetch('https://informegaming.gt.tc/wp-json/wp/v2/posts?search=GTA+6&per_page=10', {
      headers: { 'Accept': 'application/json' },
      cf: { cacheTtl: 3600 },
    });
    
    if (wpResponse.ok) {
      const posts = await wpResponse.json<Array<{
        id: number;
        title: { rendered: string };
        excerpt: { rendered: string };
        content: { rendered: string };
        date: string;
        link: string;
        _embedded?: { 'wp:featuredmedia': Array<{ source_url: string }> };
      }>>();
      
      for (const post of posts) {
        const article: NewsArticle = {
          id: `wp:${post.title.rendered.replace(/<[^>]*>/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}:gta6`,
          title: post.title.rendered.replace(/<[^>]*>/g, '').trim(),
          excerpt: truncateDescription(post.excerpt.rendered),
          content: post.content.rendered,
          date: parseToISO(post.date),
          image: post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
          url: post.link,
          categories: ['GTA 6', 'Noticias'],
          tags: ['gta6', 'rockstar'],
          author: 'informegaming',
          source: 'wordpress',
          raw: { wp_id: post.id },
        };
        
        articles.push(article);
      }
    }
  } catch (error) {
    console.error('[GTA6 News] WordPress fetch error:', error);
  }
  
  // 3. Load from Markdown files (content/gta6/*.md)
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    try {
      const mdResponse = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/content/gta6`, {
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      
      if (mdResponse.ok) {
        const files = await mdResponse.json<Array<{ name: string; download_url: string }>>();
        
        for (const file of files.filter(f => f.name.endsWith('.md'))) {
          const contentResp = await fetch(file.download_url);
          if (!contentResp.ok) continue;
          
          const content = await contentResp.text();
          // Parse frontmatter
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!fmMatch || !fmMatch[1]) continue;
          
          const fmText = fmMatch[1];
          const markdown = content.slice(fmMatch[0].length).trim();
          
          const fm: Record<string, unknown> = {};
          for (const line of fmText.split('\n')) {
            const idx = line.indexOf(':');
            if (idx > 0) {
              const key = line.slice(0, idx).trim();
              let val = line.slice(idx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              fm[key] = val;
            }
            
            const article: NewsArticle = {
              id: `markdown:${((fm['title'] as string) || file.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}:gta6`,
              title: (fm['title'] as string) || 'GTA 6 Update',
              excerpt: truncateDescription((fm['excerpt'] as string) || markdown.slice(0, 200)),
              content: markdown,
              date: parseToISO((fm['date'] as string) || new Date().toISOString()),
              image: fm['image'] ? sanitizeImageUrl(fm['image'] as string) : undefined,
              url: fm['url'] ? sanitizeUrl(fm['url'] as string) : undefined,
              categories: ['GTA 6', ...((fm['categories'] as string[]) || ['Gaming'])],
              tags: ['gta6', ...((fm['tags'] as string[]) || [])],
              author: (fm['author'] as string) || 'informegaming',
              source: 'markdown',
              raw: fm,
            };
            
            articles.push(article);
          }
        }
      }
    } catch (error) {
      console.error('[GTA6 News] Markdown fetch error:', error);
    }
  }
  
  // Deduplicate by title
  const unique = articles.filter((a, i, arr) => 
    arr.findIndex(x => x.title.toLowerCase() === a.title.toLowerCase()) === i
  );
  
  // Sort by date descending
  unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  console.log(`[GTA6 News] Total ${unique.length} articles`);
  return unique;
}