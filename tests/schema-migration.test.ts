import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(
  new URL('../scripts/db/migrate_001_schema.sql', import.meta.url),
);

let database: PGlite | undefined;

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe('migrate_001_schema.sql', () => {
  it('creates the catalog, session, and feedback tables with the initial catalog', async () => {
    database = new PGlite();
    const migration = await readFile(migrationPath, 'utf8');

    await database.exec(migration);

    const tables = await database.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    const catalog = await database.query<{ count: number }>(
      'select count(*)::int as count from board_games',
    );
    const indexes = await database.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'board_games'",
    );

    expect(tables.rows.map(({ tablename }) => tablename)).toEqual([
      'board_games',
      'recommendation_sessions',
      'user_feedback',
    ]);
    expect(catalog.rows).toEqual([{ count: 10 }]);
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'board_games_min_players_idx',
        'board_games_max_players_idx',
        'board_games_category_ids_gin_idx',
        'board_games_mechanic_ids_gin_idx',
      ]),
    );
  });
});
