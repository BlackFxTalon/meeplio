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
        'title,bgg_id,min_players,max_players,min_age,play_time_min,play_time_max,complexity_score,categories,mechanics,moods,why_play,avoid_if',
        'Крылья,266192,,5,,,,,"family|animals","engine-building","calm","Спокойная игра",""',
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
});

function createLogger(): ImportLogger & { errors: string[] } {
  const errors: string[] = [];

  return {
    errors,
    info: () => undefined,
    error: (message) => errors.push(message),
  };
}
