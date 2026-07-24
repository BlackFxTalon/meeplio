import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  SurveyAnswers,
  SurveyQuestionKey,
  SurveySession,
  SurveySessionRepository,
} from './service.js';

type SurveySessionRow = {
  id: string;
  user_id: string;
  answers: SurveyAnswers;
  status: 'draft' | 'complete';
  updated_at: string;
};

export class SupabaseSurveySessionRepository implements SurveySessionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(sessionId: string): Promise<SurveySession | null> {
    const { data, error } = await this.supabase
      .from('recommendation_sessions')
      .select('id, user_id, answers, status, updated_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toSession(data as SurveySessionRow) : null;
  }

  async findDraftByUserId(userId: number): Promise<SurveySession | null> {
    const { data, error } = await this.supabase
      .from('recommendation_sessions')
      .select('id, user_id, answers, status, updated_at')
      .eq('user_id', userId)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toSession(data as SurveySessionRow) : null;
  }

  async create(userId: number): Promise<SurveySession> {
    return this.write(
      this.supabase
        .from('recommendation_sessions')
        .insert({ user_id: userId, answers: {}, status: 'draft' })
        .select('id, user_id, answers, status, updated_at')
        .single(),
    );
  }

  async saveAnswer(
    sessionId: string,
    key: SurveyQuestionKey,
    value: string,
  ): Promise<SurveySession> {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error('Survey session was not found.');
    }

    return this.write(
      this.supabase
        .from('recommendation_sessions')
        .update({ answers: { ...session.answers, [key]: value } })
        .eq('id', sessionId)
        .select('id, user_id, answers, status, updated_at')
        .single(),
    );
  }

  async restart(sessionId: string): Promise<SurveySession> {
    return this.write(
      this.supabase
        .from('recommendation_sessions')
        .update({ answers: {}, status: 'draft' })
        .eq('id', sessionId)
        .select('id, user_id, answers, status, updated_at')
        .single(),
    );
  }

  async complete(sessionId: string): Promise<SurveySession> {
    return this.write(
      this.supabase
        .from('recommendation_sessions')
        .update({ status: 'complete' })
        .eq('id', sessionId)
        .select('id, user_id, answers, status, updated_at')
        .single(),
    );
  }

  async saveRecommendedGameIds(sessionId: string, gameIds: string[]): Promise<SurveySession> {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error('Survey session was not found.');
    }

    return this.write(
      this.supabase
        .from('recommendation_sessions')
        .update({ answers: { ...session.answers, recommended_game_ids: gameIds } })
        .eq('id', sessionId)
        .select('id, user_id, answers, status, updated_at')
        .single(),
    );
  }

  private async write(
    query: PromiseLike<{ data: unknown; error: unknown }>,
  ): Promise<SurveySession> {
    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return toSession(data as SurveySessionRow);
  }
}

function toSession(row: SurveySessionRow): SurveySession {
  return {
    id: row.id,
    userId: Number(row.user_id),
    answers: row.answers,
    status: row.status,
    updatedAt: new Date(row.updated_at),
  };
}
