export type FeedbackType = 'like' | 'dislike';

export interface FeedbackInput {
  userId: number;
  sessionId: string;
  gameId: string;
  rating: number;
}

export interface FeedbackRepository {
  save(input: Omit<FeedbackInput, 'sessionId'> & { feedbackType: FeedbackType }): Promise<void>;
  findDislikedGameIds(userId: number): Promise<string[]>;
  touchSession(sessionId: string): Promise<void>;
}

export interface FeedbackSessionRepository {
  findById(sessionId: string): Promise<{
    userId: number;
    status: 'draft' | 'complete';
    answers?: Record<string, unknown>;
  } | null>;
}

export class FeedbackService {
  constructor(
    private readonly repository: FeedbackRepository,
    private readonly sessions: FeedbackSessionRepository = {
      async findById() {
        return { userId: -1, status: 'draft' };
      },
    },
  ) {}

  async record(input: FeedbackInput): Promise<FeedbackType> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new Error('Feedback rating must be between 1 and 5.');
    }
    const session = await this.sessions.findById(input.sessionId);
    const recommendedGameIds = session?.answers?.recommended_game_ids;
    if (
      !session ||
      session.userId !== input.userId ||
      session.status !== 'complete' ||
      !Array.isArray(recommendedGameIds) ||
      !recommendedGameIds.includes(input.gameId)
    ) {
      throw new Error('Completed recommendation session was not found.');
    }

    const feedbackType: FeedbackType = input.rating <= 2 ? 'dislike' : 'like';
    await this.repository.save({
      userId: input.userId,
      gameId: input.gameId,
      rating: input.rating,
      feedbackType,
    });
    await this.repository.touchSession(input.sessionId);
    return feedbackType;
  }

  dislikedGameIds(userId: number): Promise<string[]> {
    return this.repository.findDislikedGameIds(userId);
  }
}
