import { describe, expect, it } from 'vitest';

import { FeedbackService, type FeedbackRepository } from '../src/feedback/service.js';

describe('FeedbackService', () => {
  it('records a dislike for a thumbs-down and updates the recommendation session', async () => {
    const repository = new InMemoryFeedbackRepository();
    const service = new FeedbackService(repository, completedSession);

    await service.record({ userId: 42, sessionId: 'session-1', gameId: 'game-1', rating: 1 });

    expect(repository.feedback).toEqual([
      { userId: 42, gameId: 'game-1', rating: 1, feedbackType: 'dislike' },
    ]);
    expect(repository.touchedSessionIds).toEqual(['session-1']);
  });

  it('treats one- and two-star ratings as dislikes and higher ratings as likes', async () => {
    const repository = new InMemoryFeedbackRepository();
    const service = new FeedbackService(repository, completedSession);

    await service.record({ userId: 42, sessionId: 'session-1', gameId: 'game-1', rating: 2 });
    await service.record({ userId: 42, sessionId: 'session-1', gameId: 'game-2', rating: 3 });

    expect(await service.dislikedGameIds(42)).toEqual(['game-1']);
    expect(repository.feedback[1]?.feedbackType).toBe('like');
  });

  it('rejects feedback for a session owned by another user', async () => {
    const repository = new InMemoryFeedbackRepository();
    const service = new FeedbackService(repository, {
      async findById() {
        return { userId: 99, status: 'complete' as const };
      },
    });

    await expect(
      service.record({ userId: 42, sessionId: 'foreign-session', gameId: 'game-1', rating: 1 }),
    ).rejects.toThrow('Completed recommendation session was not found.');
    expect(repository.feedback).toEqual([]);
    expect(repository.touchedSessionIds).toEqual([]);
  });

  it('rejects feedback for a game that was not recommended in the session', async () => {
    const repository = new InMemoryFeedbackRepository();
    const service = new FeedbackService(repository, completedSession);

    await expect(
      service.record({ userId: 42, sessionId: 'session-1', gameId: 'other-game', rating: 1 }),
    ).rejects.toThrow('Completed recommendation session was not found.');
    expect(repository.feedback).toEqual([]);
    expect(repository.touchedSessionIds).toEqual([]);
  });
});

class InMemoryFeedbackRepository implements FeedbackRepository {
  readonly feedback: Array<{
    userId: number;
    gameId: string;
    rating: number;
    feedbackType: 'like' | 'dislike';
  }> = [];
  readonly touchedSessionIds: string[] = [];

  async save(input: {
    userId: number;
    gameId: string;
    rating: number;
    feedbackType: 'like' | 'dislike';
  }): Promise<void> {
    this.feedback.push(input);
  }

  async findDislikedGameIds(userId: number): Promise<string[]> {
    return this.feedback
      .filter((entry) => entry.userId === userId && entry.feedbackType === 'dislike')
      .map((entry) => entry.gameId);
  }

  async touchSession(sessionId: string): Promise<void> {
    this.touchedSessionIds.push(sessionId);
  }
}

const completedSession = {
  async findById() {
    return {
      userId: 42,
      status: 'complete' as const,
      answers: { recommended_game_ids: ['game-1', 'game-2'] },
    };
  },
};
