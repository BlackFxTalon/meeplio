import { describe, expect, it } from 'vitest';

import { BOT_COMMANDS } from '../src/commands.js';

describe('Telegram command menu', () => {
  it('publishes every supported user command for Telegram autocomplete', () => {
    expect(BOT_COMMANDS).toEqual([
      { command: 'start', description: 'Начать подбор заново' },
      { command: 'pick', description: 'Подобрать настольную игру' },
      { command: 'stop', description: 'Остановить подбор' },
      { command: 'settings', description: 'Настройки' },
      { command: 'help', description: 'Помощь' },
    ]);
  });
});
