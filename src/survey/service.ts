export const surveyQuestions = [
  {
    key: 'mood',
    prompt: 'Какое настроение у вашей компании?',
    options: [
      ['social', 'Весёлая игра для общения'],
      ['family', 'Спокойная семейная игра'],
      ['strategy', 'Стратегия'],
      ['adventure', 'Приключение или сюжет'],
      ['puzzle', 'Загадки и логика'],
      ['competitive', 'Быстрая соревновательная игра'],
    ],
  },
  {
    key: 'complexity_pref',
    prompt: 'Какую сложность вы хотите?',
    options: [
      ['very_easy', 'Максимально простая'],
      ['easy', 'Простая'],
      ['medium', 'Средняя'],
      ['hard', 'Сложная'],
      ['any', 'Не имеет значения'],
    ],
  },
  {
    key: 'player_count',
    prompt: 'Сколько будет игроков?',
    options: [
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
      ['4', '4'],
      ['5', '5'],
      ['6+', '6 и более'],
    ],
  },
  {
    key: 'time_limit',
    prompt: 'Сколько времени есть на игру?',
    options: [
      ['20', 'До 20 минут'],
      ['40', 'До 40 минут'],
      ['60', 'До 60 минут'],
      ['90', 'До 90 минут'],
      ['120', 'Больше 90 минут'],
    ],
  },
  {
    key: 'interaction_type',
    prompt: 'Как вы хотите взаимодействовать?',
    options: [
      ['competitive', 'Все против всех'],
      ['cooperative', 'Команда против игры'],
      ['team', 'Команды друг против друга'],
      ['any', 'Не имеет значения'],
    ],
  },
  {
    key: 'experience',
    prompt: 'Какой у компании опыт в настольных играх?',
    options: [
      ['novice', 'Почти не играем'],
      ['casual', 'Иногда играем'],
      ['regular', 'Регулярно играем'],
      ['expert', 'Опытные настольщики'],
    ],
  },
  {
    key: 'age_group',
    prompt: 'Какой возраст игроков?',
    options: [
      ['under_8', 'Есть дети до 8 лет'],
      ['8_12', 'Есть дети 8–12 лет'],
      ['teen', 'Подростки'],
      ['adult', 'Только взрослые'],
    ],
  },
  {
    key: 'conflict',
    prompt: 'Насколько уместен конфликт?',
    options: [
      ['none', 'Без прямого конфликта'],
      ['low', 'Небольшой конфликт допустим'],
      ['high', 'Нравится активное соперничество'],
      ['any', 'Не имеет значения'],
    ],
  },
] as const;

export type SurveyQuestionKey = (typeof surveyQuestions)[number]['key'];
export type SurveyAnswers = Partial<Record<SurveyQuestionKey, string>>;
export type SurveyQuestion = (typeof surveyQuestions)[number];

export interface SurveySession {
  id: string;
  userId: number;
  answers: SurveyAnswers;
  status: 'draft' | 'complete';
  updatedAt: Date;
}

export interface SurveySessionRepository {
  findById(sessionId: string): Promise<SurveySession | null>;
  findDraftByUserId(userId: number): Promise<SurveySession | null>;
  create(userId: number): Promise<SurveySession>;
  saveAnswer(sessionId: string, key: SurveyQuestionKey, value: string): Promise<SurveySession>;
  restart(sessionId: string): Promise<SurveySession>;
  complete(sessionId: string): Promise<SurveySession>;
}

export type SurveyStartResult =
  | { kind: 'question'; session: SurveySession; question: SurveyQuestion }
  | { kind: 'recovery'; session: SurveySession };

export type SurveyAnswerResult =
  | {
      kind: 'question';
      session: SurveySession;
      question: SurveyQuestion;
      stale: boolean;
      guidance?: 'strategy_short_time';
    }
  | { kind: 'duplicate'; session: SurveySession; question: SurveyQuestion }
  | { kind: 'recovery'; session: SurveySession }
  | { kind: 'complete'; session: SurveySession };

export class SurveyService {
  private readonly lastAnswerAtByAction = new Map<string, number>();

  constructor(
    private readonly repository: SurveySessionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start(userId: number): Promise<SurveyStartResult> {
    const existingSession = await this.repository.findDraftByUserId(userId);
    if (existingSession) {
      if (this.now().getTime() - existingSession.updatedAt.getTime() > 60 * 60 * 1000) {
        return { kind: 'recovery', session: existingSession };
      }

      return this.questionFor(existingSession);
    }

    return this.questionFor(await this.repository.create(userId));
  }

  async resume(sessionId: string, userId: number): Promise<SurveyStartResult> {
    return this.questionFor(await this.sessionForUser(sessionId, userId));
  }

  async restart(sessionId: string, userId: number): Promise<SurveyStartResult> {
    await this.sessionForUser(sessionId, userId);
    return this.questionFor(await this.repository.restart(sessionId));
  }

  async reviseAnswer(
    sessionId: string,
    userId: number,
    key: SurveyQuestionKey,
    value: string,
  ): Promise<SurveyStartResult> {
    await this.sessionForUser(sessionId, userId);
    const question = surveyQuestions.find((candidate) => candidate.key === key);
    if (!question || !question.options.some(([optionValue]) => optionValue === value)) {
      throw new Error('Survey answer is not valid.');
    }

    return this.questionFor(await this.repository.saveAnswer(sessionId, key, value));
  }

  async answer(
    sessionId: string,
    userId: number,
    key: SurveyQuestionKey,
    value: string,
  ): Promise<SurveyAnswerResult> {
    const session = await this.sessionForUser(sessionId, userId);
    const currentQuestion = this.nextQuestion(session);

    if (this.isExpired(session)) {
      return { kind: 'recovery', session };
    }

    if (!currentQuestion) {
      return { kind: 'complete', session: await this.repository.complete(session.id) };
    }

    const actionKey = `${userId}:${session.id}:${key}:${value}`;
    const now = this.now().getTime();
    const lastAnswerAt = this.lastAnswerAtByAction.get(actionKey);
    if (lastAnswerAt !== undefined && now - lastAnswerAt < 3000) {
      return { kind: 'duplicate', session, question: currentQuestion };
    }

    if (currentQuestion.key !== key) {
      return { kind: 'question', session, question: currentQuestion, stale: true };
    }

    if (!currentQuestion.options.some(([optionValue]) => optionValue === value)) {
      throw new Error('Survey answer is not valid for the current question.');
    }

    this.lastAnswerAtByAction.set(actionKey, now);

    const updatedSession = await this.repository.saveAnswer(session.id, key, value);
    const nextQuestion = this.nextQuestion(updatedSession);
    if (!nextQuestion) {
      return { kind: 'complete', session: await this.repository.complete(updatedSession.id) };
    }

    return {
      kind: 'question',
      session: updatedSession,
      question: nextQuestion,
      stale: false,
      ...(this.needsShortTimeGuidance(updatedSession) ? { guidance: 'strategy_short_time' } : {}),
    };
  }

  private questionFor(session: SurveySession): SurveyStartResult {
    const question = this.nextQuestion(session);
    if (!question) {
      throw new Error('Survey has no remaining questions.');
    }

    return { kind: 'question', session, question };
  }

  private async sessionForUser(sessionId: string, userId: number): Promise<SurveySession> {
    const session = await this.repository.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error('Survey session was not found.');
    }

    return session;
  }

  private nextQuestion(session: SurveySession): SurveyQuestion | undefined {
    return surveyQuestions.find((candidate) => session.answers[candidate.key] === undefined);
  }

  private needsShortTimeGuidance(session: SurveySession): boolean {
    return (
      session.answers.mood === 'strategy' &&
      (session.answers.time_limit === '20' || session.answers.time_limit === '40')
    );
  }

  private isExpired(session: SurveySession): boolean {
    return this.now().getTime() - session.updatedAt.getTime() > 60 * 60 * 1000;
  }
}
