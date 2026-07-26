import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  importCatalog,
  parseCatalogFile,
  type CatalogDatabaseRecord,
  type ImportLogger,
} from '../scripts/import-catalog.js';

const temporaryDirectories: string[] = [];
const seedCatalogPath = fileURLToPath(new URL('../data/seed-catalog.json', import.meta.url));

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('catalog importer', () => {
  it('imports all initial seed games', async () => {
    const inserted: CatalogDatabaseRecord[] = [];
    const logger = createLogger();
    const result = await importCatalog(
      await parseCatalogFile(seedCatalogPath),
      {
        findByBggId: async () => false,
        insert: async (record) => {
          inserted.push(record);
        },
        update: async () => {
          throw new Error('update should not be called');
        },
      },
      logger,
    );

    expect(result).toEqual({ added: 10, updated: 0, errors: 0 });
    expect(inserted.map(({ bgg_id }) => bgg_id)).toHaveLength(10);
    expect(logger.errors).toEqual([]);
  });

  it('parses CSV arrays and updates only non-null imported fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'meeplio-catalog-'));
    temporaryDirectories.push(directory);
    const catalogPath = join(directory, 'catalog.csv');
    await writeFile(
      catalogPath,
      [
        'title,bgg_id,min_players,max_players,min_age,play_time_min,play_time_max,complexity_score,categories,mechanics,moods,why_play,avoid_if,summary,image_url,source_url,display_genres',
        'Крылья,266192,,5,,,,,family|animals,engine-building,calm,Спокойная игра,,Собирайте птиц,https://example.com/cover.jpg,https://example.com/game,Семейная|Стратегия',
      ].join('\n'),
    );

    const records = await parseCatalogFile(catalogPath);
    const updates: CatalogDatabaseRecord[] = [];
    const logger = createLogger();
    const result = await importCatalog(
      records,
      {
        findByBggId: async () => true,
        insert: async () => undefined,
        update: async (_bggId, changes) => {
          updates.push(changes);
        },
      },
      logger,
    );

    expect(result).toEqual({ added: 0, updated: 1, errors: 0 });
    expect(updates).toEqual([
      {
        title: 'Крылья',
        max_players: 5,
        category_ids: ['family', 'animals'],
        mechanic_ids: ['engine-building'],
        mood_tags: ['calm'],
        why_play: ['Спокойная игра'],
        summary: 'Собирайте птиц',
        image_url: 'https://example.com/cover.jpg',
        source_url: 'https://example.com/game',
        display_genres: ['Семейная', 'Стратегия'],
      },
    ]);
    expect(logger.errors).toEqual([]);
  });

  it('rejects a new game missing required fields without writing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'meeplio-catalog-'));
    temporaryDirectories.push(directory);
    const catalogPath = join(directory, 'catalog.json');
    await writeFile(catalogPath, JSON.stringify([{ title: 'Неполная игра', bgg_id: 999999 }]));

    const logger = createLogger();
    const result = await importCatalog(
      await parseCatalogFile(catalogPath),
      {
        findByBggId: async () => false,
        insert: async () => {
          throw new Error('insert should not be called');
        },
        update: async () => {
          throw new Error('update should not be called');
        },
      },
      logger,
    );

    expect(result).toEqual({ added: 0, updated: 0, errors: 1 });
    expect(logger.errors).toContain(
      'BGG ID 999999: missing required fields: min_players, max_players, min_age, play_time_min, play_time_max, complexity_score',
    );
  });

  it('rejects contradictory player and duration ranges before writing', async () => {
    const logger = createLogger();
    const result = await importCatalog(
      [
        {
          title: 'Противоречивая игра',
          bgg_id: 999998,
          min_players: 5,
          max_players: 2,
          min_age: 10,
          play_time_min: 90,
          play_time_max: 30,
          complexity_score: 2,
        },
      ],
      {
        findByBggId: async () => false,
        insert: async () => {
          throw new Error('insert should not be called');
        },
        update: async () => {
          throw new Error('update should not be called');
        },
      },
      logger,
    );

    expect(result).toEqual({ added: 0, updated: 0, errors: 1 });
    expect(logger.errors).toHaveLength(1);
  });

  it('retries as an update when a concurrent insert creates the same BGG ID', async () => {
    const updates: CatalogDatabaseRecord[] = [];
    const logger = createLogger();
    const result = await importCatalog(
      [
        {
          title: 'Конкурентная игра',
          bgg_id: 999997,
          min_players: 2,
          max_players: 4,
          min_age: 10,
          play_time_min: 30,
          play_time_max: 60,
          complexity_score: 2,
        },
      ],
      {
        findByBggId: async () => false,
        insert: async () => {
          throw new Error(
            'duplicate key value violates unique constraint "board_games_bgg_id_key"',
          );
        },
        update: async (_bggId, changes) => {
          updates.push(changes);
        },
      },
      logger,
    );

    expect(result).toEqual({ added: 0, updated: 1, errors: 0 });
    expect(updates).toEqual([
      {
        title: 'Конкурентная игра',
        min_players: 2,
        max_players: 4,
        min_age: 10,
        play_time_min: 30,
        play_time_max: 60,
        complexity_score: 2,
      },
    ]);
  });
});

function createLogger(): ImportLogger & { errors: string[] } {
  const errors: string[] = [];

  return {
    errors,
    info: () => undefined,
    error: (message) => errors.push(message),
  };
}
