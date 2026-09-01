/**
 * Tests for Noticias source (Markdown-based)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGetNoticias, handlePostNoticias, buildNoticiasFromMarkdown } from '../sources/noticias';
import { parseMarkdownFile } from '../sources/noticias';

// Mock KV Namespace
const createMockKV = (data?: any) => {
  const store = new Map<string, string>();
  if (data) {
    store.set('noticias.json', JSON.stringify(data));
  }
  
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === 'json') return JSON.parse(value);
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
};

const createMockEnv = (kv: ReturnType<typeof createMockKV>) => ({
  KV_NAMESPACE: kv,
});

describe('handleGetNoticias', () => {
  let kv: ReturnType<typeof createMockKV>;
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    kv = createMockKV();
    env = createMockEnv(kv);
  });

  it('should return empty array when KV is empty', async () => {
    const result = await handleGetNoticias(env);
    expect(result.noticias).toEqual([]);
    expect(result.version).toBe('1.0');
    expect(result.generatedAt).toBeDefined();
  });

  it('should return noticias from KV', async () => {
    const mockData = {
      generatedAt: '2026-08-28T15:00:00.000Z',
      version: '1.0',
      noticias: [
        { id: '1', title: 'Test', excerpt: 'Excerpt', content: 'Content', date: '2026-08-28T15:00:00.000Z', categories: ['PC'], tags: ['test'] },
      ],
    };
    
    kv = createMockKV(mockData);
    env = createMockEnv(kv);
    
    const result = await handleGetNoticias(env);
    expect(result.noticias).toHaveLength(1);
    expect(result.noticias[0].title).toBe('Test');
  });
});

describe('handlePostNoticias', () => {
  let kv: ReturnType<typeof createMockKV>;
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    kv = createMockKV();
    env = createMockEnv(kv);
  });

  it('should build from markdown and write to KV', async () => {
    const markdownFiles = new Map([
      ['content/noticias/test.md', `---\nid: test-1\ntitle: "Test News"\nexcerpt: "Test excerpt"\ndate: "2026-08-28T15:00:00.000Z"\ncategories: ["PC"]\ntags: ["test"]\n---\nTest content`],
    ]);
    
    const result = await handlePostNoticias(env, markdownFiles);
    
    expect(result.noticias).toHaveLength(1);
    expect(result.noticias[0].title).toBe('Test News');
    expect(result.noticias[0].id).toBe('test-1');
    
    // Verify KV was written
    const kvData = await kv._store.get('noticias.json');
    expect(kvData).toBeDefined();
    const parsed = JSON.parse(kvData!);
    expect(parsed.noticias).toHaveLength(1);
  });

  it('should return current KV data when no markdown provided', async () => {
    const mockData = {
      generatedAt: '2026-08-28T15:00:00.000Z',
      version: '1.0',
      noticias: [{ id: 'existing', title: 'Existing' }],
    };
    
    kv = createMockKV(mockData);
    env = createMockEnv(kv);
    
    const result = await handlePostNoticias(env);
    
    expect(result.noticias).toHaveLength(1);
    expect(result.noticias[0].title).toBe('Existing');
  });
});

describe('buildNoticiasFromMarkdown', () => {
  it('should parse multiple markdown files and sort by date descending', async () => {
    const kv = createMockKV();
    const env = createMockEnv(kv);
    
    const markdownFiles = new Map([
      ['content/noticias/2026-08-30-second.md', `---\nid: second\ntitle: "Second News"\nexcerpt: "Second excerpt"\ndate: "2026-08-30T15:00:00.000Z"\n---\nSecond content`],
      ['content/noticias/2026-08-28-first.md', `---\nid: first\ntitle: "First News"\nexcerpt: "First excerpt"\ndate: "2026-08-28T15:00:00.000Z"\n---\nFirst content`],
    ]);
    
    const result = await buildNoticiasFromMarkdown(env, markdownFiles);
    
    expect(result.noticias).toHaveLength(2);
    // Should be sorted by date descending (newest first)
    expect(result.noticias[0].title).toBe('Second News');
    expect(result.noticias[1].title).toBe('First News');
  });

  it('should skip files with missing required fields', async () => {
    const kv = createMockKV();
    const env = createMockEnv(kv);
    
    const markdownFiles = new Map([
      ['content/noticias/invalid.md', `---\ntitle: "Missing excerpt"\ndate: "2026-08-28T15:00:00.000Z"\n---\nContent`],
      ['content/noticias/valid.md', `---\nid: valid\ntitle: "Valid News"\nexcerpt: "Valid excerpt"\ndate: "2026-08-28T15:00:00.000Z"\n---\nValid content`],
    ]);
    
    const result = await buildNoticiasFromMarkdown(env, markdownFiles);
    
    expect(result.noticias).toHaveLength(1);
    expect(result.noticias[0].title).toBe('Valid News');
  });
});

describe('parseMarkdownFile', () => {
  it('should parse frontmatter and content', () => {
    const content = `---\nid: test-id\ntitle: "Test Title"\nexcerpt: "Test excerpt"\ndate: "2026-08-28T15:00:00.000Z"\nimage: "https://example.com/image.jpg"\nurl: "https://example.com/news"\ncategories: ["PC", "Epic"]\ntags: ["gratis", "epic-games"]\nauthor: "informegaming"\n---\nThis is the **markdown** content.`;
    
    const result = parseMarkdownFile('content/noticias/test.md', content);
    
    expect(result).not.toBeNull();
    expect(result!.id).toBe('test-id');
    expect(result!.title).toBe('Test Title');
    expect(result!.excerpt).toBe('Test excerpt');
    expect(result!.date).toBe('2026-08-28T15:00:00.000Z');
    expect(result!.image).toBe('https://example.com/image.jpg');
    expect(result!.url).toBe('https://example.com/news');
    expect(result!.categories).toEqual(['PC', 'Epic']);
    expect(result!.tags).toEqual(['gratis', 'epic-games']);
    expect(result!.author).toBe('informegaming');
    expect(result!.content).toBe('This is the **markdown** content.');
    expect(result!.source).toBe('markdown');
    expect(result!.raw.id).toBe('test-id');
  });

  it('should generate ID from filename if not in frontmatter', () => {
    const content = `---\ntitle: "Test Title"\nexcerpt: "Test excerpt"\ndate: "2026-08-28T15:00:00.000Z"\n---\nContent`;
    
    const result = parseMarkdownFile('content/noticias/2026-08-28-test-news.md', content);
    
    expect(result).not.toBeNull();
    expect(result!.id).toBe('markdown:2026-08-28-test-news');
  });

  it('should parse comma-separated arrays', () => {
    const content = `---\ntitle: "Test"\nexcerpt: "Excerpt"\ndate: "2026-08-28T15:00:00.000Z"\ncategories: PC, Epic, Steam\ntags: gratis, epic-games\n---\nContent`;
    
    const result = parseMarkdownFile('test.md', content);
    
    expect(result!.categories).toEqual(['PC', 'Epic', 'Steam']);
    expect(result!.tags).toEqual(['gratis', 'epic-games']);
  });

  it('should parse bracket-style arrays', () => {
    const content = `---\ntitle: "Test"\nexcerpt: "Excerpt"\ndate: "2026-08-28T15:00:00.000Z"\ncategories: ["PC", "Epic"]\ntags: ["gratis", "epic-games"]\n---\nContent`;
    
    const result = parseMarkdownFile('test.md', content);
    
    expect(result!.categories).toEqual(['PC', 'Epic']);
    expect(result!.tags).toEqual(['gratis', 'epic-games']);
  });

  it('should return null for missing frontmatter', () => {
    const content = 'No frontmatter here';
    
    const result = parseMarkdownFile('test.md', content);
    
    expect(result).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const content = `---\ntitle: "Test"\ndate: "2026-08-28T15:00:00.000Z"\n---\nContent`;
    
    const result = parseMarkdownFile('test.md', content);
    
    expect(result).toBeNull();
  });

  it('should sanitize URLs', () => {
    const content = `---\ntitle: "Test"\nexcerpt: "Excerpt"\ndate: "2026-08-28T15:00:00.000Z"\nimage: "not-a-url"\nurl: "javascript:alert(1)"\n---\nContent`;
    
    const result = parseMarkdownFile('test.md', content);
    
    expect(result!.image).toContain('placeholder.com');
    expect(result!.url).toBe('https://gamerpower.com/game'); // fallback to gamerpower URL
  });

  it('should parse dates correctly', () => {
    const content = `---\ntitle: "Test"\nexcerpt: "Excerpt"\ndate: "2026-08-28"\n---\nContent`;
    
    const result = parseMarkdownFile('test.md', content);
    
    expect(result!.date).toContain('2026-08-28');
  });
});