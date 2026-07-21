import { z } from 'zod';

import { createBot } from './bot.js';

const environmentSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN must be set'),
});

const environment = environmentSchema.parse(process.env);
const bot = createBot(environment.BOT_TOKEN);

void bot.start({
  allowed_updates: ['message'],
});
