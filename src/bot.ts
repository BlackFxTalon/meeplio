import { Bot, InlineKeyboard, type BotConfig, type BotError, type Context } from 'grammy';

const HEALTH_MESSAGE = 'Meeplio is ready';
const START_MESSAGE =
  'Meeplio поможет выбрать настольную игру для вашей компании и вечера. Ответьте на несколько коротких вопросов — и я предложу подходящие варианты.';
const HELP_MESSAGE =
  'Доступные команды:\n/start — начать заново\n/pick — подобрать игру\n/stop — остановить подбор\n/settings — настройки';

export function createBot(token: string, config?: BotConfig<Context>): Bot {
  const bot = new Bot(token, config);

  bot.command('start', (context) =>
    context.reply(START_MESSAGE, {
      reply_markup: new InlineKeyboard().text('Подобрать', 'pick:start'),
    }),
  );
  bot.command('help', (context) => context.reply(HELP_MESSAGE));
  bot.command('health', (context) => context.reply(HEALTH_MESSAGE));

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
