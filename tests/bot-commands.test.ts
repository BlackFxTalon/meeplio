import { describe, expect, it, vi } from 'vitest';

import { createApplication } from '../src/application.js';
import { createBot, handleBotError } from '../src/bot.js';

describe('Telegram bot', () => {
  it('initializes the bot and Supabase client without a real token', () => {
    const application = createApplication({
      BOT_TOKEN: 'test-token',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_KEY: 'test-key',
    });

    expect(application.bot.token).toBe('test-token');
    expect(application.supabase).toBeDefined();
  });

  it('answers /start with a description and the pick button', async () => {
    const bot = createTestBot();
    const replies: Array<{ text: string; replyMarkup: unknown }> = [];

    bot.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') {
        const message = payload as { text: string; reply_markup: unknown };
        replies.push({ text: message.text, replyMarkup: message.reply_markup });
      }

      return { ok: true, result: true } as never;
    });

    await bot.handleUpdate(commandUpdate('/start'));

    expect(replies).toEqual([
      {
        text: 'Meeplio поможет выбрать настольную игру для вашей компании и вечера. Ответьте на несколько коротких вопросов — и я предложу подходящие варианты.',
        replyMarkup: {
          inline_keyboard: [[{ text: 'Подобрать', callback_data: 's:p' }]],
        },
      },
    ]);
  });

  it('answers /help with the available commands', async () => {
    const bot = createTestBot();
    const replies: string[] = [];

    bot.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') {
        replies.push(String((payload as { text: string }).text));
      }

      return { ok: true, result: true } as never;
    });

    await bot.handleUpdate(commandUpdate('/help'));

    expect(replies).toEqual([
      'Доступные команды:\n/start — начать заново\n/pick — подобрать игру\n/stop — остановить подбор\n/settings — настройки',
    ]);
  });

  it('logs unexpected errors and tells the user to retry later', async () => {
    const reply = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await handleBotError({
      error: new Error('unexpected error'),
      ctx: { reply } as never,
    });

    expect(reply).toHaveBeenCalledWith('Временно не работает, попробуйте позже');
    expect(consoleError).toHaveBeenCalledWith('Unhandled bot error:', expect.any(Error));
    consoleError.mockRestore();
  });
});

function createTestBot() {
  return createBot('test-token', {
    botInfo: {
      id: 1,
      is_bot: true,
      first_name: 'Meeplio',
      username: 'meeplio_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    },
  });
}

function commandUpdate(command: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' as const, first_name: 'Test' },
      from: { id: 1, is_bot: false, first_name: 'Test' },
      text: command,
      entities: [{ offset: 0, length: command.length, type: 'bot_command' as const }],
    },
  };
}
