import type { FeedbackService } from '../feedback/service.js';
import type { SurveySession, SurveySessionRepository } from '../survey/service.js';

import { recommend, type Answers, type Game, type Recommendation } from './recommend.js';

export interface GameRepository {
  findAll(): Promise<Game[]>;
}

export interface RecommendationSessionRepository extends SurveySessionRepository {
  saveRecommendedGameIds(sessionId: string, gameIds: string[]): Promise<SurveySession>;
}

export class RecommendationService {
  constructor(
    private readonly sessions: RecommendationSessionRepository,
    private readonly feedback: FeedbackService,
    private readonly games: GameRepository,
  ) {}

  async forSession(sessionId: string, userId: number): Promise<Recommendation[]> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId || session.status !== 'complete') {
      throw new Error('Completed recommendation session was not found.');
    }

    const recommendations = recommend(session.answers as Answers, await this.games.findAll(), {
      dislikedGameIds: await this.feedback.dislikedGameIds(userId),
    });
    await this.sessions.saveRecommendedGameIds(
      sessionId,
      recommendations.map((recommendation) => recommendation.game.id),
    );
    return recommendations;
  }
}
