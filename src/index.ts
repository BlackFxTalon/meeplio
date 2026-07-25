import { z } from 'zod';

import { createApplication } from './application.js';
import { BOT_COMMANDS } from './commands.js';

const environmentSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN must be set'),
  SUPABASE_URL: z.url('SUPABASE_URL must be a valid URL'),
  SUPABASE_KEY: z.string().min(1, 'SUPABASE_KEY must be set'),
});

const environment = environmentSchema.parse(process.env);
const application = createApplication(environment);

void application.bot.api.setMyCommands(BOT_COMMANDS).then(() =>
  application.bot.start({
    allowed_updates: ['message', 'callback_query'],
  }),
);
