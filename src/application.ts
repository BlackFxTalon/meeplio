import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Bot } from 'grammy';

import { createBot } from './bot.js';

export interface ApplicationEnvironment {
  BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

export interface Application {
  bot: Bot;
  supabase: SupabaseClient;
}

export function createApplication(environment: ApplicationEnvironment): Application {
  return {
    bot: createBot(environment.BOT_TOKEN),
    supabase: createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY),
  };
}
