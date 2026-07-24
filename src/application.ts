import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Bot } from 'grammy';

import { createBot } from './bot.js';
import { FeedbackService } from './feedback/service.js';
import { SupabaseFeedbackRepository } from './feedback/supabase-feedback-repository.js';
import { RecommendationService } from './recommendations/service.js';
import { SupabaseGameRepository } from './recommendations/supabase-game-repository.js';
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
  const surveyRepository = new SupabaseSurveySessionRepository(supabase);
  const feedbackService = new FeedbackService(
    new SupabaseFeedbackRepository(supabase),
    surveyRepository,
  );

  return {
    bot: createBot(environment.BOT_TOKEN, undefined, {
      feedbackService,
      recommendationService: new RecommendationService(
        surveyRepository,
        feedbackService,
        new SupabaseGameRepository(supabase),
      ),
      surveyService: new SurveyService(surveyRepository),
    }),
    supabase,
  };
}
