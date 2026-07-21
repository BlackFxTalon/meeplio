import { describe, expect, it } from 'vitest';

import { createBot } from '../src/bot.js';

describe('/health', () => {
  it('replies with a ready status', async () => {
    const bot = createBot('test-token', {
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
    const replies: string[] = [];

    bot.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') {
        replies.push(String((payload as { text: string }).text));
      }

      return { ok: true, result: true } as never;
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 1, type: 'private', first_name: 'Test' },
        from: { id: 1, is_bot: false, first_name: 'Test' },
        text: '/health',
        entities: [{ offset: 0, length: 7, type: 'bot_command' }],
      },
    });

    expect(replies).toEqual(['Meeplio is ready']);
  });
});
