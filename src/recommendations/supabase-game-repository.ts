import type { SupabaseClient } from '@supabase/supabase-js';

import type { Game } from './recommend.js';
import type { GameRepository } from './service.js';

type BoardGameRow = {
  id: string;
  title: string;
  min_players: number;
  max_players: number;
  min_age: number;
  play_time_min: number;
  play_time_max: number;
  complexity_score: number;
  category_ids: string[];
  mechanic_ids: string[];
  mood_tags: string[];
  summary: string | null;
  image_url: string | null;
  source_url: string | null;
  display_genres: string[];
};

export class SupabaseGameRepository implements GameRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAll(): Promise<Game[]> {
    const { data, error } = await this.supabase
      .from('board_games')
      .select(
        'id, title, min_players, max_players, min_age, play_time_min, play_time_max, complexity_score, category_ids, mechanic_ids, mood_tags, summary, image_url, source_url, display_genres',
      );
    if (error) throw error;

    return (data as BoardGameRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      minPlayers: row.min_players,
      maxPlayers: row.max_players,
      minAge: row.min_age,
      playTimeMin: row.play_time_min,
      playTimeMax: row.play_time_max,
      complexityScore: row.complexity_score,
      categoryIds: row.category_ids,
      mechanicIds: row.mechanic_ids,
      moodTags: row.mood_tags,
      summary: row.summary,
      imageUrl: row.image_url,
      sourceUrl: row.source_url,
      displayGenres: row.display_genres,
    }));
  }
}
