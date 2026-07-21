import { Bot, InlineKeyboard, type BotConfig, type BotError, type Context } from 'grammy';

import type { SurveyQuestion, SurveyService, SurveyStartResult } from './survey/service.js';

const HEALTH_MESSAGE = 'Meeplio is ready';
const START_MESSAGE =
  'Meeplio поможет выбрать настольную игру для вашей компании и вечера. Ответьте на несколько коротких вопросов — и я предложу подходящие варианты.';
const HELP_MESSAGE =
  'Доступные команды:\n/start — начать заново\n/pick — подобрать игру\n/stop — остановить подбор\n/settings — настройки';

export interface BotDependencies {
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
      reply_markup: new InlineKeyboard().text('Подобрать', 'pick:start'),
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
    if (!service || !context.from) {
      return;
    }

    if (context.callbackQuery.data === 'pick:start') {
      await context.answerCallbackQuery();
      await replyWithSurveyStart(context, await service.start(context.from.id));
      return;
    }

    const [namespace, action, sessionId, key, value] = context.callbackQuery.data.split(':');
    if (namespace !== 'survey' || !sessionId) {
      return;
    }

    await context.answerCallbackQuery();
    if (action === 'resume') {
      await replyWithSurveyStart(context, await service.resume(sessionId, context.from.id));
      return;
    }
    if (action === 'restart') {
      await replyWithSurveyStart(context, await service.restart(sessionId, context.from.id));
      return;
    }
    if (action === 'revise' && key && value) {
      await replyWithSurveyStart(
        context,
        await service.reviseAnswer(
          sessionId,
          context.from.id,
          key as Parameters<SurveyService['reviseAnswer']>[2],
          value,
        ),
      );
      return;
    }
    if (action === 'answer' && key && value) {
      const result = await service.answer(
        sessionId,
        context.from.id,
        key as Parameters<SurveyService['answer']>[2],
        value,
      );
      if (result.kind === 'complete') {
        await context.reply('Спасибо! Подбор игр появится в следующем сообщении.');
      } else if (result.kind === 'duplicate') {
        return;
      } else {
        if (result.guidance === 'strategy_short_time') {
          await context.reply(
            'Стратегия часто раскрывается лучше за час или дольше. Увеличить время или оставить быстрый формат?',
            {
              reply_markup: new InlineKeyboard()
                .text('Увеличить до 60 минут', `survey:revise:${result.session.id}:time_limit:60`)
                .text('Оставить быстрый формат', `survey:resume:${result.session.id}`),
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
        .text('Продолжить', `survey:resume:${result.session.id}`)
        .text('Начать заново', `survey:restart:${result.session.id}`),
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
    keyboard.text(label, `survey:answer:${sessionId}:${question.key}:${value}`);
    if (index < question.options.length - 1) {
      keyboard.row();
    }
  }

  await context.reply(question.prompt, { reply_markup: keyboard });
}
