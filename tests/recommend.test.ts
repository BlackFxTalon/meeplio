import { describe, expect, it } from 'vitest';

import { recommend, type Answers, type Game } from '../src/recommendations/recommend.js';

const answers: Answers = {
  mood: 'strategy',
  complexity_pref: 'medium',
  player_count: '2',
  time_limit: '60',
  interaction_type: 'competitive',
  experience: 'casual',
  age_group: 'adult',
  conflict: 'low',
};

describe('recommend', () => {
  it('filters out games that do not support the player count or age group', () => {
    const results = recommend(answers, [
      game({ id: 'eligible', minPlayers: 2, maxPlayers: 4, minAge: 12 }),
      game({ id: 'too-many-players', minPlayers: 3, maxPlayers: 5 }),
      game({ id: 'too-old', minAge: 21 }),
    ]);

    expect(results.map((result) => result.game.id)).toEqual(['eligible']);
  });

  it('ranks an exact preference match ahead of a near match', () => {
    const results = recommend(answers, [
      game({ id: 'near', moodTags: ['social'], complexityScore: 3.5, playTimeMax: 60 }),
      game({ id: 'exact', moodTags: ['strategic'], complexityScore: 3, playTimeMax: 60 }),
    ]);

    expect(results.map((result) => result.game.id)).toEqual(['exact', 'near']);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it('penalizes a game that is only slightly longer than the requested time', () => {
    const results = recommend(answers, [
      game({ id: 'within-time', playTimeMin: 45, playTimeMax: 60 }),
      game({ id: 'near-time', playTimeMin: 60, playTimeMax: 75 }),
    ]);

    expect(results[0]?.game.id).toBe('within-time');
    expect(results[1]?.score).toBeGreaterThan(0);
  });

  it('adds the beautiful-match bonus for a game designed exactly for two players', () => {
    const results = recommend(answers, [
      game({ id: 'range', minPlayers: 2, maxPlayers: 4 }),
      game({ id: 'two-player', minPlayers: 2, maxPlayers: 2 }),
    ]);

    expect(results[0]).toMatchObject({ game: { id: 'two-player' }, score: 100 });
  });

  it('uses a documented fallback when fewer than three category types are available', () => {
    const results = recommend(answers, [
      game({ id: 'strategy-a', categoryIds: ['strategy'] }),
      game({ id: 'strategy-b', categoryIds: ['strategy'] }),
      game({ id: 'strategy-c', categoryIds: ['strategy'] }),
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.diversityFallback !== undefined)).toBe(true);
  });
});

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game',
    title: 'Test game',
    minPlayers: 2,
    maxPlayers: 4,
    minAge: 12,
    playTimeMin: 45,
    playTimeMax: 60,
    complexityScore: 3,
    categoryIds: ['strategy'],
    mechanicIds: ['competitive'],
    moodTags: ['strategic'],
    ...overrides,
  };
}
