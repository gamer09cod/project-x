-- Additive: player rating (not used in matchmaking).
-- Start 1000. Win +20, loss -20 (floored at 0). Draw / no opponent: no change.

alter table users
  add column if not exists rating integer not null default 1000;

alter table users
  drop constraint if exists users_rating_non_negative;
alter table users
  add constraint users_rating_non_negative check (rating >= 0);

comment on column users.rating is
  'Display rating only. Matchmaking is FCFS by game_id + stake_cents, never by rating.';
