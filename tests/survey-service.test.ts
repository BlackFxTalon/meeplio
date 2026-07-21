import { describe, expect, it } from 'vitest';

import {
  SurveyService,
  type SurveyQuestionKey,
  type SurveySession,
  type SurveySessionRepository,
} from '../src/survey/service.js';

describe('SurveyService', () => {
  it('creates a draft session and starts with the mood question', async () => {
    const repository = new InMemorySurveySessionRepository();
    const service = new SurveyService(repository, () => new Date('2026-07-22T10:00:00Z'));

    const result = await service.start(42);

    expect(result).toMatchObject({
      kind: 'question',
      session: {
        userId: 42,
        status: 'draft',
        answers: {},
      },
      question: {
        key: 'mood',
        prompt: 'Какое настроение у вашей компании?',
      },
    });
    expect(result.kind).toBe('question');
    if (result.kind === 'question') {
      expect(result.question.options).toHaveLength(6);
    }
  });

  it('persists one answer, advances to the next question, and ignores a duplicate click', async () => {
    const repository = new InMemorySurveySessionRepository();
    let now = new Date('2026-07-22T10:00:00Z');
    const service = new SurveyService(repository, () => now);
    const started = await service.start(42);

    if (started.kind !== 'question') {
      throw new Error('Expected a question');
    }

    const answered = await service.answer(started.session.id, 42, 'mood', 'social');
    expect(answered).toMatchObject({ kind: 'question', question: { key: 'complexity_pref' } });
    expect(repository.session?.answers).toEqual({ mood: 'social' });

    now = new Date('2026-07-22T10:00:01Z');
    const duplicate = await service.answer(started.session.id, 42, 'mood', 'social');
    expect(duplicate).toMatchObject({ kind: 'duplicate', question: { key: 'complexity_pref' } });
    expect(repository.session?.answers).toEqual({ mood: 'social' });
  });

  it('offers a choice when a strategic game has too little time', async () => {
    const repository = new InMemorySurveySessionRepository();
    let now = new Date('2026-07-22T10:00:00Z');
    const service = new SurveyService(repository, () => now);
    const started = await service.start(42);
    if (started.kind !== 'question') {
      throw new Error('Expected a question');
    }

    await service.answer(started.session.id, 42, 'mood', 'strategy');
    now = new Date('2026-07-22T10:00:04Z');
    await service.answer(started.session.id, 42, 'complexity_pref', 'easy');
    now = new Date('2026-07-22T10:00:08Z');
    await service.answer(started.session.id, 42, 'player_count', '2');
    now = new Date('2026-07-22T10:00:12Z');
    const result = await service.answer(started.session.id, 42, 'time_limit', '20');

    expect(result).toMatchObject({
      kind: 'question',
      question: { key: 'interaction_type' },
      guidance: 'strategy_short_time',
    });
  });

  it('asks whether to resume a draft older than one hour', async () => {
    const repository = new InMemorySurveySessionRepository();
    repository.session = {
      id: 'session-1',
      userId: 42,
      answers: { mood: 'social' },
      status: 'draft',
      updatedAt: new Date('2026-07-22T08:59:59Z'),
    };
    const service = new SurveyService(repository, () => new Date('2026-07-22T10:00:00Z'));

    await expect(service.start(42)).resolves.toMatchObject({
      kind: 'recovery',
      session: { id: 'session-1' },
    });
  });
});

class InMemorySurveySessionRepository implements SurveySessionRepository {
  session: SurveySession | null = null;

  async findById(sessionId: string): Promise<SurveySession | null> {
    return this.session?.id === sessionId ? this.session : null;
  }

  async findDraftByUserId(userId: number): Promise<SurveySession | null> {
    return this.session?.userId === userId ? this.session : null;
  }

  async create(userId: number): Promise<SurveySession> {
    this.session = {
      id: 'session-1',
      userId,
      answers: {},
      status: 'draft',
      updatedAt: new Date('2026-07-22T10:00:00Z'),
    };
    return this.session;
  }

  async saveAnswer(
    _sessionId: string,
    key: SurveyQuestionKey,
    value: string,
  ): Promise<SurveySession> {
    if (!this.session) {
      throw new Error('No session');
    }

    this.session = { ...this.session, answers: { ...this.session.answers, [key]: value } };
    return this.session;
  }

  async restart(): Promise<SurveySession> {
    throw new Error('not needed in this test');
  }

  async complete(): Promise<SurveySession> {
    throw new Error('not needed in this test');
  }
}
