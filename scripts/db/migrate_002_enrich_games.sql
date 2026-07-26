begin;

alter table board_games
  add column if not exists summary text,
  add column if not exists image_url text,
  add column if not exists source_url text,
  add column if not exists display_genres text[] not null default '{}';

commit;
