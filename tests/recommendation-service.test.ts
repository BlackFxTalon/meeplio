import { describe, expect, it } from 'vitest';

import { FeedbackService, type FeedbackRepository } from '../src/feedback/service.js';
import type { Game } from '../src/recommendations/recommend.js';
import {
  RecommendationService,
  type GameRepository,
  type RecommendationSessionRepository,
} from '../src/recommendations/service.js';
import type { SurveySession } from '../src/survey/service.js';

describe('RecommendationService', () => {
  it('stores the IDs it presents before feedback can be accepted', async () => {
    const sessions = new InMemorySessions();
    const service = new RecommendationService(
      sessions,
      new FeedbackService(new EmptyFeedbackRepository(), sessions),
      new InMemoryGames(),
    );

    const recommendations = await service.forSession('session-1', 42);

    expect(recommendations.map((recommendation) => recommendation.game.id)).toEqual(['game-1']);
    expect(sessions.savedRecommendationIds).toEqual(['game-1']);
  });
});

class InMemorySessions implements RecommendationSessionRepository {
  readonly savedRecommendationIds: string[] = [];
  private readonly session: SurveySession = {
    id: 'session-1',
    userId: 42,
    status: 'complete',
    updatedAt: new Date(),
    answers: {
      mood: 'strategy',
      complexity_pref: 'medium',
      player_count: '2',
      time_limit: '60',
      interaction_type: 'any',
      experience: 'casual',
      age_group: 'adult',
      conflict: 'low',
    },
  };
  async findById(id: string) {
    return id === this.session.id ? this.session : null;
  }
  async findDraftByUserId() {
    return null;
  }
  async create() {
    return this.session;
  }
  async saveAnswer(): Promise<SurveySession> {
    return this.session;
  }
  async restart() {
    return this.session;
  }
  async complete() {
    return this.session;
  }
  async saveRecommendedGameIds(_id: string, gameIds: string[]) {
    this.savedRecommendationIds.splice(0, Infinity, ...gameIds);
    return this.session;
  }
}
class EmptyFeedbackRepository implements FeedbackRepository {
  async save() {}
  async findDislikedGameIds() {
    return [];
  }
  async touchSession() {}
}
class InMemoryGames implements GameRepository {
  async findAll(): Promise<Game[]> {
    return [
      {
        id: 'game-1',
        title: 'Game',
        minPlayers: 2,
        maxPlayers: 2,
        minAge: 10,
        playTimeMin: 45,
        playTimeMax: 60,
        complexityScore: 3,
        categoryIds: ['strategy'],
        mechanicIds: [],
        moodTags: ['strategic'],
      },
    ];
  }
}
