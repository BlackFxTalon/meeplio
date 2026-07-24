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

const AGE_MINIMUM: Record<string, number> = { under_8: 5, '8_12': 8, teen: 13, adult: 18 };
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
const HIGH_CONFLICT_MECHANICS = new Set(['take-that', 'area-control', 'aggressive']);

export function recommend(answers: Answers, games: Game[]): Recommendation[] {
  const playerCount = answers.player_count === '6+' ? 6 : Number(answers.player_count);
  const ageMinimum = AGE_MINIMUM[answers.age_group] ?? 18;
  const ranked = games
    .filter((game) => game.minPlayers <= playerCount && playerCount <= game.maxPlayers)
    .filter((game) => game.minAge <= ageMinimum)
    .map((game) => ({ game, score: score(game, answers, playerCount) }))
    .sort(
      (left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title),
    );

  return selectDiverseTopThree(ranked);
}

function score(game: Game, answers: Answers, playerCount: number): number {
  const [complexityMin, complexityMax] = COMPLEXITY_RANGE[answers.complexity_pref] ?? [1, 5];
  const timeLimit = TIME_LIMIT[answers.time_limit] ?? Infinity;
  const experienceMax = EXPERIENCE_MAX[answers.experience] ?? 5;
  const hasHighConflict = game.mechanicIds.some((mechanic) =>
    HIGH_CONFLICT_MECHANICS.has(mechanic),
  );

  const total =
    (game.moodTags.includes(answers.mood) ? 25 : 0) +
    (game.complexityScore >= complexityMin && game.complexityScore <= complexityMax ? 15 : 0) +
    15 +
    (game.playTimeMax <= timeLimit ? 10 : game.playTimeMin <= timeLimit ? 5 : 0) +
    (answers.interaction_type === 'any' || game.mechanicIds.includes(answers.interaction_type)
      ? 10
      : 0) +
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
