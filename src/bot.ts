import { Bot, type BotConfig, type Context } from 'grammy';

const HEALTH_MESSAGE = 'Meeplio is ready';

export function createBot(token: string, config?: BotConfig<Context>): Bot {
  const bot = new Bot(token, config);

  bot.command('start', (context) =>
    context.reply('Привет! Я Meeplio — помогу выбрать настольную игру для вашей компании.'),
  );
  bot.command('help', (context) => context.reply('Используйте /pick, чтобы начать подбор игры.'));
  bot.command('health', (context) => context.reply(HEALTH_MESSAGE));

  return bot;
}
