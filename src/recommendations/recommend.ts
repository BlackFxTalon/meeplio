export interface Answers {
  mood: string;
  complexity_pref: string;
  player_count: string;
  time_limit: string;
  interaction_type: string;
  experience: string;
  age_group: string;
  conflict: string;
}

export interface Game {
  id: string;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  minAge: number;
  playTimeMin: number;
  playTimeMax: number;
  complexityScore: number;
  categoryIds: string[];
  mechanicIds: string[];
  moodTags: string[];
}

export interface Recommendation {
  game: Game;
  score: number;
  diversityFallback?: string;
}

export interface RecommendationOptions {
  dislikedGameIds?: Iterable<string>;
  penaltyGameIds?: Iterable<string>;
}

const AGE_GROUP_ASSUMED_AGE: Record<string, number> = {
  under_8: 5,
  '8_12': 8,
  teen: 13,
  adult: 18,
};
const MOOD_TAGS: Record<string, string[]> = {
  social: ['social', 'competitive'],
  family: ['family', 'calm'],
  strategy: ['strategic'],
  adventure: ['adventure'],
  puzzle: ['puzzle', 'calm'],
  competitive: ['competitive', 'quick'],
};
const TIME_LIMIT: Record<string, number> = {
  '20': 20,
  '40': 40,
  '60': 60,
  '90': 90,
  '120': Infinity,
};
const COMPLEXITY_RANGE: Record<string, readonly [number, number]> = {
  very_easy: [1, 1.75],
  easy: [1.75, 2.75],
  medium: [2.75, 3.75],
  hard: [3.75, 5],
  any: [1, 5],
};
const EXPERIENCE_MAX: Record<string, number> = { novice: 2, casual: 3, regular: 4, expert: 5 };
const HIGH_CONFLICT_TAGS = new Set(['competitive']);

export function recommend(
  answers: Answers,
  games: Game[],
  options: RecommendationOptions = {},
): Recommendation[] {
  const playerCount = answers.player_count === '6+' ? 6 : Number(answers.player_count);
  const ageMinimum = AGE_GROUP_ASSUMED_AGE[answers.age_group] ?? 18;
  const dislikedGameIds = new Set(options.dislikedGameIds);
  const penaltyGameIds = new Set(options.penaltyGameIds);
  const ranked = games
    .filter((game) => !dislikedGameIds.has(game.id))
    .filter((game) => game.minPlayers <= playerCount && playerCount <= game.maxPlayers)
    .filter((game) => game.minAge <= ageMinimum)
    .map((game) => ({
      game,
      score: Math.round(
        score(game, answers, playerCount) * (penaltyGameIds.has(game.id) ? 0.5 : 1),
      ),
    }))
    .sort(
      (left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title),
    );

  return selectDiverseTopThree(ranked);
}

function score(game: Game, answers: Answers, playerCount: number): number {
  const [complexityMin, complexityMax] = COMPLEXITY_RANGE[answers.complexity_pref] ?? [1, 5];
  const timeLimit = TIME_LIMIT[answers.time_limit] ?? Infinity;
  const experienceMax = EXPERIENCE_MAX[answers.experience] ?? 5;
  const moodTags = MOOD_TAGS[answers.mood] ?? [answers.mood];
  const interactionMatches =
    answers.interaction_type === 'any' ||
    game.mechanicIds.includes(answers.interaction_type) ||
    game.moodTags.includes(answers.interaction_type) ||
    (answers.interaction_type === 'team' && game.moodTags.includes('cooperative'));
  const hasHighConflict = game.moodTags.some((tag) => HIGH_CONFLICT_TAGS.has(tag));

  const total =
    (game.moodTags.some((tag) => moodTags.includes(tag)) ? 25 : 0) +
    (game.complexityScore >= complexityMin && game.complexityScore <= complexityMax ? 15 : 0) +
    15 +
    (game.playTimeMax <= timeLimit ? 10 : game.playTimeMin <= timeLimit ? 5 : 0) +
    (interactionMatches ? 10 : 0) +
    (game.complexityScore <= experienceMax ? 5 : 0) +
    5 +
    (conflictMatches(answers.conflict, hasHighConflict) ? 5 : 0) +
    (game.minPlayers === playerCount && game.maxPlayers === playerCount ? 10 : 0);

  return Math.min(total, 100);
}

function conflictMatches(conflict: string, hasHighConflict: boolean): boolean {
  if (conflict === 'any') return true;
  if (conflict === 'high') return hasHighConflict;
  return !hasHighConflict;
}

function selectDiverseTopThree(ranked: Recommendation[]): Recommendation[] {
  const selected: Recommendation[] = [];
  const categories = new Set<string>();
  const remaining = [...ranked];

  while (selected.length < 3 && remaining.length > 0) {
    const diverseIndex = remaining.findIndex((candidate) =>
      candidate.game.categoryIds.some((category) => !categories.has(category)),
    );
    const index = diverseIndex === -1 ? 0 : diverseIndex;
    const [next] = remaining.splice(index, 1);
    if (!next) break;
    selected.push(next);
    for (const category of next.game.categoryIds) categories.add(category);
  }

  if (categories.size < 3 && selected.length === 3) {
    return selected.map((recommendation) => ({
      ...recommendation,
      diversityFallback: 'В каталоге не нашлось трёх рекомендаций разных категорий.',
    }));
  }

  return selected;
}
