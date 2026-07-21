import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Bot } from 'grammy';

import { createBot } from './bot.js';
import { SurveyService } from './survey/service.js';
import { SupabaseSurveySessionRepository } from './survey/supabase-session-repository.js';

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
  const supabase = createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY);

  return {
    bot: createBot(environment.BOT_TOKEN, undefined, {
      surveyService: new SurveyService(new SupabaseSurveySessionRepository(supabase)),
    }),
    supabase,
  };
}
