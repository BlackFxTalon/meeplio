import { Bot, InlineKeyboard, type BotConfig, type BotError, type Context } from 'grammy';

import type { FeedbackService } from './feedback/service.js';
import type { RecommendationService } from './recommendations/service.js';
import {
  surveyQuestions,
  type SurveyQuestion,
  type SurveyService,
  type SurveyStartResult,
} from './survey/service.js';

const HEALTH_MESSAGE = 'Meeplio is ready';
const START_MESSAGE =
  'Meeplio поможет выбрать настольную игру для вашей компании и вечера. Ответьте на несколько коротких вопросов — и я предложу подходящие варианты.';
const HELP_MESSAGE =
  'Доступные команды:\n/start — начать заново\n/pick — подобрать игру\n/stop — остановить подбор\n/settings — настройки';

export interface BotDependencies {
  feedbackService?: FeedbackService;
  recommendationService?: RecommendationService;
  surveyService?: SurveyService;
}

export function createBot(
  token: string,
  config?: BotConfig<Context>,
  dependencies: BotDependencies = {},
): Bot {
  const bot = new Bot(token, config);

  bot.command('start', (context) =>
    context.reply(START_MESSAGE, {
      reply_markup: new InlineKeyboard().text('Подобрать', 's:p'),
    }),
  );
  bot.command('help', (context) => context.reply(HELP_MESSAGE));
  bot.command('health', (context) => context.reply(HEALTH_MESSAGE));
  bot.command('pick', async (context) => {
    const service = dependencies.surveyService;
    if (!service || !context.from) {
      await context.reply('Подбор временно недоступен. Попробуйте позже.');
      return;
    }

    await replyWithSurveyStart(context, await service.start(context.from.id));
  });

  bot.on('callback_query:data', async (context) => {
    const service = dependencies.surveyService;
    if (!context.from) {
      return;
    }

    const [namespace, action, encodedSessionId, questionIndex, optionIndex] =
      context.callbackQuery.data.split(':');
    const sessionId = encodedSessionId ? decodeCallbackId(encodedSessionId) : undefined;

    if (namespace === 's' && action === 'p' && service) {
      await context.answerCallbackQuery();
      await replyWithSurveyStart(context, await service.start(context.from.id));
      return;
    }

    const feedbackService = dependencies.feedbackService;
    if (namespace === 'f' && action && encodedSessionId && questionIndex && feedbackService) {
      const feedbackSessionId = decodeCallbackId(action);
      const gameId = decodeCallbackId(encodedSessionId);
      const rating = questionIndex === 'd' ? 1 : questionIndex === 'l' ? 5 : undefined;
      if (!feedbackSessionId || !gameId || rating === undefined) {
        return;
      }
      await context.answerCallbackQuery();
      const feedbackType = await feedbackService.record({
        userId: context.from.id,
        sessionId: feedbackSessionId,
        gameId,
        rating,
      });
      await context.reply(
        feedbackType === 'dislike' ? 'Учту: эту игру больше не предложу.' : 'Спасибо за оценку!',
      );
      return;
    }

    if (!service || namespace !== 's' || !sessionId) {
      return;
    }

    await context.answerCallbackQuery();
    if (action === 'r') {
      await replyWithSurveyStart(context, await service.resume(sessionId, context.from.id));
      return;
    }
    if (action === 'x') {
      await replyWithSurveyStart(context, await service.restart(sessionId, context.from.id));
      return;
    }
    if ((action === 'v' || action === 'a') && questionIndex && optionIndex) {
      const question = surveyQuestions[Number(questionIndex)];
      const value = question?.options[Number(optionIndex)]?.[0];
      if (!question || !value) {
        return;
      }
      if (action === 'v') {
        await replyWithSurveyStart(
          context,
          await service.reviseAnswer(sessionId, context.from.id, question.key, value),
        );
        return;
      }
      const result = await service.answer(sessionId, context.from.id, question.key, value);
      if (result.kind === 'complete') {
        const recommendationService = dependencies.recommendationService;
        if (!recommendationService) {
          await context.reply('Опрос завершён. Ваши ответы сохранены.');
          return;
        }
        const recommendations = await recommendationService.forSession(
          result.session.id,
          context.from.id,
        );
        if (recommendations.length === 0) {
          await context.reply('Подходящих игр не нашлось. Попробуйте изменить ответы.');
          return;
        }
        for (const recommendation of recommendations) {
          await context.reply(
            `${recommendation.game.title} — совпадение ${recommendation.score}/100`,
            { reply_markup: feedbackKeyboard(result.session.id, recommendation.game.id) },
          );
        }
      } else if (result.kind === 'recovery') {
        await replyWithSurveyStart(context, result);
      } else if (result.kind === 'duplicate') {
        return;
      } else {
        if (result.guidance === 'strategy_short_time') {
          await context.reply(
            'Стратегия часто раскрывается лучше за час или дольше. Увеличить время или оставить быстрый формат?',
            {
              reply_markup: new InlineKeyboard()
                .text(
                  'Увеличить до 60 минут',
                  surveyAnswerData('v', result.session.id, 'time_limit', '60'),
                )
                .text('Оставить быстрый формат', surveySessionData('r', result.session.id)),
            },
          );
          return;
        }
        await replyWithQuestion(context, result.question, result.session.id);
      }
    }
  });

  bot.catch(handleBotError);

  return bot;
}

export async function handleBotError(
  error: Pick<BotError<Context>, 'error' | 'ctx'>,
): Promise<void> {
  console.error('Unhandled bot error:', error.error);

  try {
    await error.ctx.reply('Временно не работает, попробуйте позже');
  } catch (replyError) {
    console.error('Could not send the error message:', replyError);
  }
}

async function replyWithSurveyStart(context: Context, result: SurveyStartResult): Promise<void> {
  if (result.kind === 'recovery') {
    await context.reply('Вы начали подбор больше часа назад. Продолжить или начать заново?', {
      reply_markup: new InlineKeyboard()
        .text('Продолжить', surveySessionData('r', result.session.id))
        .text('Начать заново', surveySessionData('x', result.session.id)),
    });
    return;
  }

  await replyWithQuestion(context, result.question, result.session.id);
}

async function replyWithQuestion(
  context: Context,
  question: SurveyQuestion,
  sessionId: string,
): Promise<void> {
  const keyboard = new InlineKeyboard();
  for (const [index, [value, label]] of question.options.entries()) {
    keyboard.text(label, surveyAnswerData('a', sessionId, question.key, value));
    if (index < question.options.length - 1) {
      keyboard.row();
    }
  }

  await context.reply(question.prompt, { reply_markup: keyboard });
}

export function feedbackKeyboard(sessionId: string, gameId: string): InlineKeyboard {
  const callbackData = (feedback: 'l' | 'd') =>
    `f:${encodeCallbackId(sessionId)}:${encodeCallbackId(gameId)}:${feedback}`;

  return new InlineKeyboard()
    .text('Подходит 👍', callbackData('l'))
    .text('Не подходит 👎', callbackData('d'));
}

function surveySessionData(action: 'r' | 'x', sessionId: string): string {
  return `s:${action}:${encodeCallbackId(sessionId)}`;
}

function surveyAnswerData(
  action: 'a' | 'v',
  sessionId: string,
  questionKey: SurveyQuestion['key'],
  value: string,
): string {
  const questionIndex = surveyQuestions.findIndex((question) => question.key === questionKey);
  const optionIndex = surveyQuestions[questionIndex]?.options.findIndex(
    ([optionValue]) => optionValue === value,
  );
  if (questionIndex < 0 || optionIndex === undefined || optionIndex < 0) {
    throw new Error('Survey callback data is not valid.');
  }

  return `s:${action}:${encodeCallbackId(sessionId)}:${questionIndex}:${optionIndex}`;
}

function encodeCallbackId(value: string): string {
  if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    return Buffer.from(value.replaceAll('-', ''), 'hex').toString('base64url');
  }
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeCallbackId(value: string): string | undefined {
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (value.length === 22 && decoded.length === 16) {
      const hex = decoded.toString('hex');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return decoded.toString('utf8');
  } catch {
    return undefined;
  }
}
