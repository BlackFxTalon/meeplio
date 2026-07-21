begin;

create table board_games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  min_players smallint not null check (min_players > 0),
  max_players smallint not null check (max_players >= min_players),
  min_age smallint not null check (min_age >= 0),
  play_time_min smallint not null check (play_time_min > 0),
  play_time_max smallint not null check (play_time_max >= play_time_min),
  complexity_score numeric(3, 2) not null check (complexity_score between 1 and 5),
  category_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(category_ids) = 'array'),
  mechanic_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(mechanic_ids) = 'array'),
  mood_tags jsonb not null default '[]'::jsonb check (jsonb_typeof(mood_tags) = 'array'),
  why_play text[] not null default '{}',
  avoid_if text[] not null default '{}',
  bgg_id integer not null unique check (bgg_id > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recommendation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null,
  game_id uuid not null references board_games (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback_type text not null check (feedback_type in ('like', 'dislike', 'skip')),
  notes text,
  created_at timestamptz not null default now()
);

create index board_games_min_players_idx on board_games (min_players);
create index board_games_max_players_idx on board_games (max_players);
create index board_games_category_ids_gin_idx on board_games using gin (category_ids);
create index board_games_mechanic_ids_gin_idx on board_games using gin (mechanic_ids);

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger board_games_set_updated_at
before update on board_games
for each row execute function set_updated_at();

create trigger recommendation_sessions_set_updated_at
before update on recommendation_sessions
for each row execute function set_updated_at();

insert into board_games (
  title,
  min_players,
  max_players,
  min_age,
  play_time_min,
  play_time_max,
  complexity_score,
  category_ids,
  mechanic_ids,
  mood_tags,
  why_play,
  avoid_if,
  bgg_id
)
values
  (
    'Бирмингем',
    2,
    4,
    14,
    60,
    120,
    3.87,
    '["strategy", "economic"]',
    '["network-building", "hand-management"]',
    '["strategic", "competitive"]',
    array['Глубокая экономическая стратегия', 'Сильное взаимодействие между игроками'],
    array['Нужна быстрая и простая игра', 'Не нравится жёсткая конкуренция'],
    224517
  ),
  (
    'Ковчег',
    1,
    4,
    14,
    90,
    150,
    3.76,
    '["strategy", "economic"]',
    '["tableau-building", "card-drafting"]',
    '["strategic", "calm"]',
    array['Развитие собственного зоопарка', 'Много вариантов для долгосрочной стратегии'],
    array['Есть мало времени', 'Компания только начинает знакомство с настольными играми'],
    342942
  ),
  (
    'Дюна: Империум',
    1,
    4,
    14,
    60,
    120,
    3.03,
    '["strategy", "science-fiction"]',
    '["deck-building", "worker-placement"]',
    '["strategic", "competitive"]',
    array['Сочетает построение колоды и размещение рабочих', 'Напряжённая борьба за ключевые действия'],
    array['Не знакомы с современными стратегиями', 'Не нравится соревновательное взаимодействие'],
    316554
  ),
  (
    'Покорение Марса',
    1,
    5,
    12,
    90,
    150,
    3.26,
    '["strategy", "science-fiction"]',
    '["engine-building", "card-drafting"]',
    '["strategic", "competitive"]',
    array['Можно строить уникальный движок', 'Тема терраформирования развивается прямо на поле'],
    array['Нужна партия до часа', 'Не хочется большого числа карт и эффектов'],
    167791
  ),
  (
    'Мрачная гавань',
    1,
    4,
    14,
    60,
    120,
    3.91,
    '["adventure", "fantasy"]',
    '["campaign", "cooperative", "hand-management"]',
    '["adventure", "cooperative"]',
    array['Кооперативная кампания с развитием персонажей', 'Тактические бои без ведущего'],
    array['Нет желания играть сериями', 'Нужны простые правила для первого вечера'],
    174430
  ),
  (
    'Крылья',
    1,
    5,
    10,
    40,
    70,
    2.47,
    '["family", "animals"]',
    '["engine-building", "card-drafting"]',
    '["calm", "strategic"]',
    array['Спокойная стратегия с красивым оформлением', 'Подходит для смешанной по опыту компании'],
    array['Хочется активного конфликта', 'Нужна очень короткая партия'],
    266192
  ),
  (
    'Каскадия',
    1,
    4,
    10,
    30,
    45,
    1.85,
    '["family", "puzzle"]',
    '["tile-placement", "pattern-building"]',
    '["calm", "family"]',
    array['Легко объяснить новым игрокам', 'Приятная головоломка без прямого конфликта'],
    array['Нужна игра с активным взаимодействием', 'Компания хочет сложную стратегию'],
    295947
  ),
  (
    'Экипаж: Миссия «Глубокое море»',
    2,
    5,
    10,
    20,
    30,
    2.04,
    '["cooperative", "card-game"]',
    '["trick-taking", "cooperative"]',
    '["cooperative", "quick"]',
    array['Короткая кооперативная карточная игра', 'Серии миссий постепенно раскрывают правила'],
    array['Не нравится жанр взяток', 'Нужна игра для шести и более игроков'],
    324856
  ),
  (
    'Азул',
    2,
    4,
    8,
    30,
    45,
    1.77,
    '["family", "abstract"]',
    '["tile-drafting", "pattern-building"]',
    '["calm", "competitive"]',
    array['Простые правила и тактические решения', 'Красивый и понятный игровой процесс'],
    array['Нужна кооперативная игра', 'Не нравится абстрактная стратегия'],
    230802
  ),
  (
    '7 чудес: Дуэль',
    2,
    2,
    10,
    30,
    45,
    2.23,
    '["strategy", "civilization"]',
    '["card-drafting", "set-collection"]',
    '["strategic", "competitive"]',
    array['Специально создана для двух игроков', 'Есть несколько путей к победе'],
    array['Игроков больше двух', 'Не хочется прямого соперничества'],
    173346
  );

commit;
