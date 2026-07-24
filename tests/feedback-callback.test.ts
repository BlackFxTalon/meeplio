import { describe, expect, it } from 'vitest';

import { createBot, feedbackKeyboard } from '../src/bot.js';
import { FeedbackService, type FeedbackRepository } from '../src/feedback/service.js';

describe('feedback callbacks', () => {
  it('records a thumbs-down callback and confirms it to the user', async () => {
    const repository = new InMemoryFeedbackRepository();
    const bot = createBot(
      'test-token',
      { botInfo },
      { feedbackService: new FeedbackService(repository) },
    );
    const replies: string[] = [];
    bot.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') replies.push(String((payload as { text: string }).text));
      return { ok: true, result: true } as never;
    });

    await bot.handleUpdate(callbackUpdate('feedback:rate:session-1:game-1:1'));

    expect(repository.feedback).toEqual([
      { userId: 1, gameId: 'game-1', rating: 1, feedbackType: 'dislike' },
    ]);
    expect(repository.touched).toEqual(['session-1']);
    expect(replies).toEqual(['Учту: эту игру больше не предложу.']);
  });

  it('builds buttons for like, dislike, and five ratings', () => {
    expect(feedbackKeyboard('session-1', 'game-1').inline_keyboard.flat()).toHaveLength(7);
  });
});

class InMemoryFeedbackRepository implements FeedbackRepository {
  readonly feedback: Array<{
    userId: number;
    gameId: string;
    rating: number;
    feedbackType: 'like' | 'dislike';
  }> = [];
  readonly touched: string[] = [];
  async save(input: {
    userId: number;
    gameId: string;
    rating: number;
    feedbackType: 'like' | 'dislike';
  }): Promise<void> {
    this.feedback.push(input);
  }
  async findDislikedGameIds(): Promise<string[]> {
    return [];
  }
  async touchSession(sessionId: string): Promise<void> {
    this.touched.push(sessionId);
  }
}

const botInfo = {
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
} as const;

function callbackUpdate(data: string) {
  return {
    update_id: 1,
    callback_query: {
      id: 'callback-1',
      from: { id: 1, is_bot: false, first_name: 'Test' },
      chat_instance: 'test',
      data,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 1, type: 'private' as const, first_name: 'Test' },
      },
    },
  };
}
