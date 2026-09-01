/**
 * Noticias source - Markdown-based
 * Reads from KV (populated by build script) or builds from Markdown files
 * Compatible with frontend noticias.js expectations
 */

import type { Env, NewsArticle, NewsOutput } from '../types';
import { parseToISO, sanitizeUrl, sanitizeImageUrl, truncateDescription, generateId } from '../utils/normalize';

const NOTICIAS_KV_KEY = 'noticias.json';

/**
 * Fetch noticias from KV (populated by build script)
 */
export async function fetchNoticiasFromKV(env: Env): Promise<NewsArticle[]> {
  try {
    const data = await env.KV_NAMESPACE.get<NewsOutput>(NOTICIAS_KV_KEY, 'json');
    if (data && data.noticias && Array.isArray(data.noticias)) {
      console.log(`[Noticias] Loaded ${data.noticias.length} articles from KV`);
      return data.noticias;
    }
  } catch (error) {
    console.warn('[Noticias] Failed to read from KV:', error);
  }
  return [];
}

/**
 * Build noticias from Markdown files (used by POST /noticias and build script)
 * This function contains the core logic shared between Worker and build script
 */
export async function buildNoticiasFromMarkdown(env: Env, markdownFiles: Map<string, string>): Promise<NewsOutput> {
  const noticias: NewsArticle[] = [];
  
  for (const [filepath, content] of markdownFiles.entries()) {
    try {
      const article = parseMarkdownFile(filepath, content);
      if (article) {
        noticias.push(article);
      }
    } catch (error) {
      console.error(`[Noticias] Failed to parse ${filepath}:`, error);
    }
  }
  
  // Sort by date descending (newest first)
  noticias.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const output: NewsOutput = {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    noticias,
  };
  
  console.log(`[Noticias] Built ${noticias.length} articles from Markdown`);
  return output;
}

/**
 * Parse a single Markdown file with frontmatter
 */
function parseMarkdownFile(filepath: string, content: string): NewsArticle | null {
  // Extract frontmatter (--- ... ---)
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch || !frontmatterMatch[1]) {
    console.warn(`[Noticias] No frontmatter in ${filepath}`);
    return null;
  }
  
  const frontmatterText = frontmatterMatch[1];
  const markdownContent = content.slice(frontmatterMatch[0].length).trim();
  
  // Parse frontmatter (simple YAML-like)
  const frontmatter: Record<string, unknown> = {};
  for (const line of frontmatterText.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();
      
      // Remove quotes from string values
      if (typeof value === 'string') {
        const strVal = value;
        if ((strVal.startsWith('"') && strVal.endsWith('"')) || 
            (strVal.startsWith("'") && strVal.endsWith("'"))) {
          value = strVal.slice(1, -1);
        } else {
          // Parse arrays (simple: [item1, item2] or item1, item2)
          if (strVal.startsWith('[') && strVal.endsWith(']')) {
            try {
              value = strVal.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
            } catch {
              value = [];
            }
          } else if (strVal.includes(',')) {
            value = strVal.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          }
        }
      }
      
      frontmatter[key] = value;
    }
  }
  
  // Helper to get string value from frontmatter
  const getString = (key: string): string => (frontmatter[key] as string) || '';
  const getStringArray = (key: string): string[] => {
    const val = frontmatter[key];
    if (Array.isArray(val)) return val as string[];
    if (typeof val === 'string') return [val];
    return [];
  };
  
  // Required fields
  const id = getString('id') || generateIdFromPath(filepath);
  const title = getString('title');
  const excerpt = getString('excerpt');
  const date = getString('date');
  
  if (!title || !excerpt || !date) {
    console.warn(`[Noticias] Missing required fields in ${filepath}`);
    return null;
  }
  
  // Parse date
  const parsedDate = parseToISO(date);
  
  const article: NewsArticle = {
    id,
    title: title.trim(),
    excerpt: excerpt.trim(),
    content: markdownContent,
    date: parsedDate,
    image: getString('image') ? sanitizeImageUrl(getString('image')) : undefined,
    url: getString('url') ? sanitizeUrl(getString('url')) : undefined,
    categories: getStringArray('categories'),
    tags: getStringArray('tags'),
    author: getString('author') || undefined,
    source: 'markdown',
    raw: frontmatter,
  };
  
  return article;
}

/**
 * Generate ID from file path
 */
function generateIdFromPath(filepath: string): string {
  const filename = filepath.split('/').pop() || 'unknown';
  const slug = filename.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `markdown:${slug}`;
}

/**
 * GET /noticias handler - reads from KV
 */
export async function handleGetNoticias(env: Env): Promise<NewsOutput> {
  const noticias = await fetchNoticiasFromKV(env);
  
  return {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    noticias,
  };
}

/**
 * POST /noticias handler - rebuilds from Markdown (triggered manually)
 * Note: In Worker context, we can't read local files, so this expects
 * the Markdown content to be passed or fetched from GitHub
 */
export async function handlePostNoticias(env: Env, markdownContent?: Map<string, string>): Promise<NewsOutput> {
  // If markdown content provided (e.g., from build script), use it
  if (markdownContent && markdownContent.size > 0) {
    const output = await buildNoticiasFromMarkdown(env, markdownContent);
    
    // Write to KV
    try {
      await env.KV_NAMESPACE.put(NOTICIAS_KV_KEY, JSON.stringify(output));
      console.log('[Noticias] Written to KV successfully');
    } catch (error) {
      console.error('[Noticias] Failed to write to KV:', error);
      throw error;
    }
    
    return output;
  }
  
  // Fallback: try to fetch from GitHub raw (if GITHUB_TOKEN and GITHUB_REPO set)
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    try {
      const markdownFiles = await fetchMarkdownFromGitHub(env);
      if (markdownFiles.size > 0) {
        const output = await buildNoticiasFromMarkdown(env, markdownFiles);
        await env.KV_NAMESPACE.put(NOTICIAS_KV_KEY, JSON.stringify(output));
        return output;
      }
    } catch (error) {
      console.error('[Noticias] Failed to fetch from GitHub:', error);
    }
  }
  
  // Last resort: return current KV data
  const current = await fetchNoticiasFromKV(env);
  return {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    noticias: current,
  };
}

/**
 * Fetch Markdown files from GitHub repo (content/noticias/*.md)
 */
async function fetchMarkdownFromGitHub(env: Env): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const repo = env.GITHUB_REPO!;
  const token = env.GITHUB_TOKEN!;
  const path = 'content/noticias';
  
  try {
    // Get directory contents
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'informegaming-ingest',
      },
    });
    
    if (!response.ok) {
      console.warn(`[Noticias] GitHub API returned ${response.status}`);
      return files;
    }
    
    const items = await response.json() as Array<{ name: string; type: string; download_url: string }>;
    const mdFiles = items.filter(item => item.type === 'file' && item.name.endsWith('.md'));
    
    // Fetch each file content
    for (const file of mdFiles) {
      try {
        const fileResp = await fetch(file.download_url, {
          headers: { 'User-Agent': 'informegaming-ingest' },
        });
        if (fileResp.ok) {
          const content = await fileResp.text();
          files.set(`content/noticias/${file.name}`, content);
        }
      } catch (error) {
        console.error(`[Noticias] Failed to fetch ${file.name}:`, error);
      }
    }
  } catch (error) {
    console.error('[Noticias] GitHub fetch error:', error);
  }
  
  return files;
}