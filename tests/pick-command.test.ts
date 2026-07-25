import { describe, expect, it } from 'vitest';

import { createBot, feedbackKeyboard } from '../src/bot.js';
import {
  SurveyService,
  type SurveyQuestionKey,
  type SurveySession,
  type SurveySessionRepository,
} from '../src/survey/service.js';

describe('/pick', () => {
  it('creates a session and presents the mood question with inline answers', async () => {
    const repository = new InMemorySurveySessionRepository();
    const bot = createBot(
      'test-token',
      { botInfo },
      { surveyService: new SurveyService(repository, () => new Date('2026-07-22T10:00:00Z')) },
    );
    const replies: Array<{ text: string; replyMarkup: unknown }> = [];

    bot.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') {
        const message = payload as { text: string; reply_markup: unknown };
        replies.push({ text: message.text, replyMarkup: message.reply_markup });
      }

      return { ok: true, result: true } as never;
    });

    await bot.handleUpdate(commandUpdate('/pick'));

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toBe('Какое настроение у вашей компании?');
    expect((replies[0]?.replyMarkup as { inline_keyboard: unknown }).inline_keyboard).toEqual([
      [{ text: 'Весёлая игра для общения', callback_data: 's:a:c2Vzc2lvbi0x:0:0' }],
      [{ text: 'Спокойная семейная игра', callback_data: 's:a:c2Vzc2lvbi0x:0:1' }],
      [{ text: 'Стратегия', callback_data: 's:a:c2Vzc2lvbi0x:0:2' }],
      [{ text: 'Приключение или сюжет', callback_data: 's:a:c2Vzc2lvbi0x:0:3' }],
      [{ text: 'Загадки и логика', callback_data: 's:a:c2Vzc2lvbi0x:0:4' }],
      [{ text: 'Быстрая соревновательная игра', callback_data: 's:a:c2Vzc2lvbi0x:0:5' }],
    ]);
    expect(repository.createdUserIds).toEqual([1]);
  });

  it('keeps every callback payload for a production UUID within Telegram’s 64-byte limit', async () => {
    const repository = new InMemorySurveySessionRepository('6e8f71a9-3c72-43b8-9a47-7c9626c026d6');
    const bot = createBot(
      'test-token',
      { botInfo },
      { surveyService: new SurveyService(repository, () => new Date('2026-07-22T10:00:00Z')) },
    );
    const callbackPayloads: string[] = [];

    bot.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') {
        const message = payload as {
          reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> };
        };
        callbackPayloads.push(
          ...message.reply_markup.inline_keyboard.flat().map((button) => button.callback_data),
        );
      }

      return { ok: true, result: true } as never;
    });

    await bot.handleUpdate(commandUpdate('/pick'));

    expect(callbackPayloads).not.toHaveLength(0);
    expect(callbackPayloads.every((payload) => Buffer.byteLength(payload, 'utf8') <= 64)).toBe(
      true,
    );
  });

  it('keeps feedback callbacks for production UUIDs within Telegram’s 64-byte limit', () => {
    const keyboard = feedbackKeyboard(
      '6e8f71a9-3c72-43b8-9a47-7c9626c026d6',
      '6b25c5df-13b8-4475-948c-0f7989c3bb07',
    );
    const callbackPayloads = keyboard.inline_keyboard
      .flat()
      .filter(
        (button): button is { text: string; callback_data: string } => 'callback_data' in button,
      )
      .map((button) => button.callback_data);

    expect(callbackPayloads).not.toHaveLength(0);
    expect(callbackPayloads.every((payload) => Buffer.byteLength(payload, 'utf8') <= 64)).toBe(
      true,
    );
  });
});

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

class InMemorySurveySessionRepository implements SurveySessionRepository {
  readonly createdUserIds: number[] = [];
  private session: SurveySession | null = null;

  constructor(private readonly sessionId = 'session-1') {}

  async findById(sessionId: string): Promise<SurveySession | null> {
    return this.session?.id === sessionId ? this.session : null;
  }

  async findDraftByUserId(userId: number): Promise<SurveySession | null> {
    return this.session?.userId === userId ? this.session : null;
  }

  async create(userId: number): Promise<SurveySession> {
    this.createdUserIds.push(userId);
    this.session = {
      id: this.sessionId,
      userId,
      answers: {},
      status: 'draft',
      updatedAt: new Date('2026-07-22T10:00:00Z'),
    };
    return this.session;
  }

  async saveAnswer(
    _sessionId: string,
    key: SurveyQuestionKey,
    value: string,
  ): Promise<SurveySession> {
    if (!this.session) {
      throw new Error('No session');
    }

    this.session = { ...this.session, answers: { ...this.session.answers, [key]: value } };
    return this.session;
  }

  async restart(sessionId: string): Promise<SurveySession> {
    if (!this.session || this.session.id !== sessionId) {
      throw new Error('No session');
    }

    this.session = { ...this.session, answers: {} };
    return this.session;
  }

  async complete(sessionId: string): Promise<SurveySession> {
    if (!this.session || this.session.id !== sessionId) {
      throw new Error('No session');
    }

    this.session = { ...this.session, status: 'complete' };
    return this.session;
  }
}
