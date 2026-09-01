/**
 * Build Script: Markdown → noticias.json
 * Processes content/noticias/*.md files and generates public/data/noticias.json
 * Runs during `npm run build` and in GitHub Actions CI
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'content', 'noticias');
const PUBLIC_DATA_DIR = path.join(PROJECT_ROOT, 'public', 'data');
const DIST_DATA_DIR = path.join(PROJECT_ROOT, 'dist', 'data');
const OUTPUT_FILE = path.join(PUBLIC_DATA_DIR, 'noticias.json');
const DIST_OUTPUT_FILE = path.join(DIST_DATA_DIR, 'noticias.json');

interface Frontmatter {
  id?: string;
  title: string;
  excerpt: string;
  date: string;
  image?: string;
  url?: string;
  categories?: string | string[];
  tags?: string | string[];
  author?: string;
  [key: string]: unknown;
}

interface NewsArticle {
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

interface NewsOutput {
  generatedAt: string;
  version: string;
  noticias: NewsArticle[];
}

/**
 * Parse date string to ISO 8601
 */
function parseToISO(dateStr: string): string {
  if (!dateStr || dateStr === 'N/A') {
    return new Date('2099-12-31T23:59:59.000Z').toISOString();
  }
  
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  
  // Try common formats
  const formats = [
    /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
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
  
  console.warn(`[build-noticias] Could not parse date: ${dateStr}, using far future`);
  return new Date('2099-12-31T23:59:59.000Z').toISOString();
}

/**
 * Sanitize URL
 */
function sanitizeUrl(url: string | undefined): string {
  if (!url) return '#';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
  } catch {
    // Ignore
  }
  return '#';
}

/**
 * Sanitize image URL
 */
function sanitizeImageUrl(url: string | undefined): string {
  if (!url) return 'https://via.placeholder.com/300x160/1f2937/00ffcc?text=No+Image';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
  } catch {
    // Ignore
  }
  return 'https://via.placeholder.com/300x160/1f2937/00ffcc?text=No+Image';
}

/**
 * Truncate description
 */
function truncateDescription(desc: string, max = 200): string {
  if (!desc) return '';
  const cleaned = desc.replace(/<[^>]*>/g, '').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd() + '…';
}

/**
 * Generate ID from title
 */
function generateId(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `markdown:${normalized}`;
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Frontmatter; markdown: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }
  
  const frontmatterText = match[1];
  const markdown = content.slice(match[0].length).trim();
  
  const frontmatter: Frontmatter = {};
  
  for (const line of frontmatterText.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Parse arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        } catch {
          value = [];
        }
      } else if (value.includes(',')) {
        value = value.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      }
      
      frontmatter[key] = value;
    }
  }
  
  return { frontmatter, markdown };
}

/**
 * Process a single markdown file
 */
function processMarkdownFile(filepath: string, filename: string): NewsArticle | null {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const parsed = parseFrontmatter(content);
    
    if (!parsed) {
      console.warn(`[build-noticias] No frontmatter in ${filename}`);
      return null;
    }
    
    const { frontmatter, markdown } = parsed;
    
    // Validate required fields
    if (!frontmatter.title || !frontmatter.excerpt || !frontmatter.date) {
      console.warn(`[build-noticias] Missing required fields in ${filename}`);
      return null;
    }
    
    const id = frontmatter.id as string || generateId(frontmatter.title);
    const date = parseToISO(frontmatter.date);
    
    // Normalize arrays
    const categories = Array.isArray(frontmatter.categories) 
      ? frontmatter.categories 
      : (frontmatter.categories ? [frontmatter.categories as string] : []);
    
    const tags = Array.isArray(frontmatter.tags) 
      ? frontmatter.tags 
      : (frontmatter.tags ? [frontmatter.tags as string] : []);
    
    const article: NewsArticle = {
      id,
      title: frontmatter.title.trim(),
      excerpt: frontmatter.excerpt.trim(),
      content: markdown,
      date,
      image: frontmatter.image ? sanitizeImageUrl(frontmatter.image as string) : undefined,
      url: frontmatter.url ? sanitizeUrl(frontmatter.url as string) : undefined,
      categories,
      tags,
      author: frontmatter.author as string,
      source: 'markdown',
      raw: frontmatter,
    };
    
    return article;
  } catch (error) {
    console.error(`[build-noticias] Error processing ${filename}:`, error);
    return null;
  }
}

/**
 * Main build function
 */
export async function buildNoticias(): Promise<NewsOutput> {
  process.stdout.write('[build-noticias] Starting build...\n');
  
  // Ensure directories exist
  if (!fs.existsSync(CONTENT_DIR)) {
    process.stdout.write(`[build-noticias] Content directory not found: ${CONTENT_DIR}, creating...\n`);
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(PUBLIC_DATA_DIR)) {
    fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(DIST_DATA_DIR)) {
    fs.mkdirSync(DIST_DATA_DIR, { recursive: true });
  }
  
  // Read all markdown files
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  process.stdout.write(`[build-noticias] CONTENT_DIR: ${CONTENT_DIR}\n`);
  process.stdout.write(`[build-noticias] Files found: ${JSON.stringify(files)}\n`);
  
  if (files.length === 0) {
    process.stdout.write('[build-noticias] No markdown files found, generating empty output\n');
    const emptyOutput: NewsOutput = {
      generatedAt: new Date().toISOString(),
      version: '1.0',
      noticias: [],
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(emptyOutput, null, 2));
    fs.writeFileSync(DIST_OUTPUT_FILE, JSON.stringify(emptyOutput, null, 2));
    return emptyOutput;
  }
  
  process.stdout.write(`[build-noticias] Found ${files.length} markdown files\n`);
  
  // Process each file
  const noticias: NewsArticle[] = [];
  
  for (const file of files) {
    const filepath = path.join(CONTENT_DIR, file);
    const article = processMarkdownFile(filepath, file);
    if (article) {
      noticias.push(article);
    }
  }
  
  // Sort by date descending (newest first)
  noticias.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const output: NewsOutput = {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    noticias,
  };
  
  // Write to public/data (for GitHub Pages)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  process.stdout.write(`[build-noticias] Written to ${OUTPUT_FILE}\n`);
  
  // Write to dist/data (for build output)
  fs.writeFileSync(DIST_OUTPUT_FILE, JSON.stringify(output, null, 2));
  process.stdout.write(`[build-noticias] Written to ${DIST_OUTPUT_FILE}\n`);
  
  process.stdout.write(`[build-noticias] Build complete: ${noticias.length} articles\n`);
  return output;
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  buildNoticias()
    .then(() => {
      process.stdout.write('[build-noticias] Success\n');
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write('[build-noticias] Failed: ' + error + '\n');
      process.exit(1);
    });
}