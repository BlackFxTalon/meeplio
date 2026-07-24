import type { SupabaseClient } from '@supabase/supabase-js';

import type { FeedbackRepository, FeedbackType } from './service.js';

export class SupabaseFeedbackRepository implements FeedbackRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(input: {
    userId: number;
    gameId: string;
    rating: number;
    feedbackType: FeedbackType;
  }): Promise<void> {
    const { error } = await this.supabase.from('user_feedback').insert({
      user_id: input.userId,
      game_id: input.gameId,
      rating: input.rating,
      feedback_type: input.feedbackType,
    });
    if (error) throw error;
  }

  async findDislikedGameIds(userId: number): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('user_feedback')
      .select('game_id')
      .eq('user_id', userId)
      .eq('feedback_type', 'dislike');
    if (error) throw error;

    return (data ?? []).map((row) => String((row as { game_id: string }).game_id));
  }

  async touchSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('recommendation_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw error;
  }
}
