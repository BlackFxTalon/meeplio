import type { FeedbackService } from '../feedback/service.js';
import type { SurveySessionRepository } from '../survey/service.js';

import { recommend, type Answers, type Game, type Recommendation } from './recommend.js';

export interface GameRepository {
  findAll(): Promise<Game[]>;
}

export class RecommendationService {
  constructor(
    private readonly sessions: SurveySessionRepository,
    private readonly feedback: FeedbackService,
    private readonly games: GameRepository,
  ) {}

  async forSession(sessionId: string, userId: number): Promise<Recommendation[]> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId || session.status !== 'complete') {
      throw new Error('Completed recommendation session was not found.');
    }

    return recommend(session.answers as Answers, await this.games.findAll(), {
      dislikedGameIds: await this.feedback.dislikedGameIds(userId),
    });
  }
}
