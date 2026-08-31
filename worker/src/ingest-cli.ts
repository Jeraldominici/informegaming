/**
 * CLI script to run ingest locally for testing
 * Usage: npx tsx src/ingest-cli.ts
 */

import { fetchGamerPower } from './sources/gamerpower';
import { fetchEpicGames } from './sources/epic';
import { fetchXboxFreePlayDays } from './sources/xbox';
import { deduplicateGames } from './utils/normalize';
import type { Env, GameFree, IngestOutput } from './types';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// Mock KV namespace for local testing
class MockKV {
  private store = new Map<string, string>();
  
  async get(key: string, type?: 'json') {
    const val = this.store.get(key);
    if (!val) return null;
    return type === 'json' ? JSON.parse(val) : val;
  }
  
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

// Mock env
const mockEnv: Env = {
  KV_NAMESPACE: new MockKV() as any,
  PARSE_API_KEY: process.env.PARSE_API_KEY,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_REPO: process.env.GITHUB_REPO,
};

async function runLocalIngest(): Promise<IngestOutput> {
  console.log('[Local Ingest] Starting...');
  
  const results = await Promise.allSettled([
    fetchGamerPower(mockEnv),
    fetchEpicGames(mockEnv),
    fetchXboxFreePlayDays(mockEnv),
  ]);
  
  const allGames: GameFree[] = [];
  const sourceNames = ['gamerpower', 'epic', 'xbox'];
  
  results.forEach((result, index) => {
    const source = sourceNames[index];
    if (result.status === 'fulfilled') {
      console.log(`[Local Ingest] ${source}: ${result.value.length} games`);
      allGames.push(...result.value);
    } else {
      console.error(`[Local Ingest] ${source} failed:`, result.reason);
    }
  });
  
  const uniqueGames = deduplicateGames(allGames);
  console.log(`[Local Ingest] Total: ${allGames.length}, Unique: ${uniqueGames.length}`);
  
  const output: IngestOutput = {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    games: uniqueGames,
  };
  
  // Write to local public/data for frontend testing
  const outputPath = resolve(__dirname, '../../public/data/juegos.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[Local Ingest] Written to ${outputPath}`);
  
  // Also write to worker KV mock
  await mockEnv.KV_NAMESPACE.put('juegos.json', JSON.stringify(output));
  
  return output;
}

runLocalIngest()
  .then(result => {
    console.log(`[Local Ingest] ✅ Completed: ${result.games.length} games`);
    process.exit(0);
  })
  .catch(err => {
    console.error('[Local Ingest] ❌ Failed:', err);
    process.exit(1);
  });