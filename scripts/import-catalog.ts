import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const environmentSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_KEY: z.string().min(1, 'SUPABASE_KEY must be set'),
});

const nullableString = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}, z.string().min(1).nullable());

const nullableNumber = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? null : value),
  z.coerce.number().finite().nullable(),
);

const nullableStringArray = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    if (normalized.startsWith('[')) {
      try {
        return JSON.parse(normalized);
      } catch {
        return value;
      }
    }

    return normalized
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().min(1)).nullable(),
);

const catalogGameSchema = z
  .object({
    title: nullableString,
    bgg_id: z.coerce.number().int().positive(),
    min_players: nullableNumber.pipe(z.number().int().positive().nullable()),
    max_players: nullableNumber.pipe(z.number().int().positive().nullable()),
    min_age: nullableNumber.pipe(z.number().int().nonnegative().nullable()),
    play_time_min: nullableNumber.pipe(z.number().int().positive().nullable()),
    play_time_max: nullableNumber.pipe(z.number().int().positive().nullable()),
    complexity_score: nullableNumber.pipe(z.number().min(1).max(5).nullable()),
    categories: nullableStringArray,
    mechanics: nullableStringArray,
    moods: nullableStringArray,
    why_play: nullableStringArray,
    avoid_if: nullableStringArray,
  })
  .superRefine((game, context) => {
    if (
      game.min_players !== null &&
      game.max_players !== null &&
      game.max_players < game.min_players
    ) {
      context.addIssue({
        code: 'custom',
        message: 'max_players must be greater than or equal to min_players',
        path: ['max_players'],
      });
    }

    if (
      game.play_time_min !== null &&
      game.play_time_max !== null &&
      game.play_time_max < game.play_time_min
    ) {
      context.addIssue({
        code: 'custom',
        message: 'play_time_max must be greater than or equal to play_time_min',
        path: ['play_time_max'],
      });
    }
  });

export type CatalogGame = z.infer<typeof catalogGameSchema>;

export interface CatalogDatabaseRecord {
  title?: string;
  min_players?: number;
  max_players?: number;
  min_age?: number;
  play_time_min?: number;
  play_time_max?: number;
  complexity_score?: number;
  category_ids?: string[];
  mechanic_ids?: string[];
  mood_tags?: string[];
  why_play?: string[];
  avoid_if?: string[];
  bgg_id?: number;
}

export interface CatalogRepository {
  findByBggId(bggId: number): Promise<boolean>;
  insert(record: CatalogDatabaseRecord): Promise<void>;
  update(bggId: number, changes: CatalogDatabaseRecord): Promise<void>;
}

export interface ImportLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface ImportSummary {
  added: number;
  updated: number;
  errors: number;
}

const requiredInsertFields = [
  'title',
  'min_players',
  'max_players',
  'min_age',
  'play_time_min',
  'play_time_max',
  'complexity_score',
] as const;

export async function parseCatalogFile(path: string): Promise<unknown[]> {
  const extension = extname(path).toLowerCase();
  const content = await readFile(path, 'utf8');

  if (extension === '.json') {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('JSON catalog must contain an array of games.');
    }

    return parsed;
  }

  if (extension === '.csv') {
    return parseCsv(content);
  }

  throw new Error('Catalog file must have a .json or .csv extension.');
}

export async function importCatalog(
  records: unknown[],
  repository: CatalogRepository,
  logger: ImportLogger,
): Promise<ImportSummary> {
  const summary: ImportSummary = { added: 0, updated: 0, errors: 0 };

  for (const record of records) {
    const parsed = catalogGameSchema.safeParse(record);
    if (!parsed.success) {
      summary.errors += 1;
      logger.error(`Invalid catalog record: ${z.prettifyError(parsed.error)}`);
      continue;
    }

    const game = parsed.data;
    const changes = toDatabaseRecord(game);

    try {
      if (await repository.findByBggId(game.bgg_id)) {
        if (Object.keys(changes).length > 0) {
          await repository.update(game.bgg_id, changes);
          summary.updated += 1;
        }
        continue;
      }

      const missingFields = requiredInsertFields.filter((field) => game[field] === null);
      if (missingFields.length > 0) {
        summary.errors += 1;
        logger.error(`BGG ID ${game.bgg_id}: missing required fields: ${missingFields.join(', ')}`);
        continue;
      }

      try {
        await repository.insert({ ...changes, bgg_id: game.bgg_id });
        summary.added += 1;
      } catch (error) {
        if (!isDuplicateBggId(error)) {
          throw error;
        }

        await repository.update(game.bgg_id, changes);
        summary.updated += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.error(`BGG ID ${game.bgg_id}: ${errorMessage(error)}`);
    }
  }

  return summary;
}

export function createSupabaseCatalogRepository(client: SupabaseClient): CatalogRepository {
  return {
    async findByBggId(bggId) {
      const { data, error } = await client
        .from('board_games')
        .select('bgg_id')
        .eq('bgg_id', bggId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data !== null;
    },
    async insert(record) {
      const { error } = await client.from('board_games').insert(record);

      if (error) {
        throw new Error(error.message);
      }
    },
    async update(bggId, changes) {
      const { error } = await client.from('board_games').update(changes).eq('bgg_id', bggId);

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

function toDatabaseRecord(game: CatalogGame): CatalogDatabaseRecord {
  return {
    ...(game.title === null ? {} : { title: game.title }),
    ...(game.min_players === null ? {} : { min_players: game.min_players }),
    ...(game.max_players === null ? {} : { max_players: game.max_players }),
    ...(game.min_age === null ? {} : { min_age: game.min_age }),
    ...(game.play_time_min === null ? {} : { play_time_min: game.play_time_min }),
    ...(game.play_time_max === null ? {} : { play_time_max: game.play_time_max }),
    ...(game.complexity_score === null ? {} : { complexity_score: game.complexity_score }),
    ...(game.categories === null ? {} : { category_ids: game.categories }),
    ...(game.mechanics === null ? {} : { mechanic_ids: game.mechanics }),
    ...(game.moods === null ? {} : { mood_tags: game.moods }),
    ...(game.why_play === null ? {} : { why_play: game.why_play }),
    ...(game.avoid_if === null ? {} : { avoid_if: game.avoid_if }),
  };
}

function parseCsv(content: string): Record<string, string>[] {
  const rows = parseCsvRows(content);
  const [headers, ...values] = rows;

  if (!headers || headers.length === 0 || headers.every((header) => header === '')) {
    throw new Error('CSV catalog must include a header row.');
  }

  return values
    .filter((row) => row.some((value) => value !== ''))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header.trim(), row[index] ?? ''])),
    );
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error('CSV catalog has an unclosed quoted field.');
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDuplicateBggId(error: unknown): boolean {
  return errorMessage(error).includes('duplicate key');
}

async function main(): Promise<void> {
  const catalogPath = resolve(process.argv[2] ?? 'data/seed-catalog.json');
  const parsedEnvironment = environmentSchema.safeParse(process.env);
  if (!parsedEnvironment.success) {
    throw new Error('Set SUPABASE_URL and SUPABASE_KEY before importing a catalog.');
  }

  const environment = parsedEnvironment.data;
  const logger: ImportLogger = console;
  const records = await parseCatalogFile(catalogPath);
  const repository = createSupabaseCatalogRepository(
    createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY),
  );
  const summary = await importCatalog(records, repository, logger);

  logger.info(`Added: ${summary.added}; updated: ${summary.updated}; errors: ${summary.errors}.`);
  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
