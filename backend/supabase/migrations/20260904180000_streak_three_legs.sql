-- Phase 8b / DECISIONS §2.1 + §11: 3-leg streak, frozen ladder, 24h expiry.
-- Ops-tunable ladder; streaks freeze T1/T2/T3 at startStreak.

create table if not exists streak_target_ladders (
  id uuid primary key default gen_random_uuid(),
  game_id text not null default 'basketball_v1',
  stake_cents_min bigint not null default 0,
  stake_cents_max bigint,
  target_1 integer not null,
  target_2 integer not null,
  target_3 integer not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint streak_target_ladders_game_id_not_blank check (char_length(game_id) > 0),
  constraint streak_target_ladders_stake_min_nonneg check (stake_cents_min >= 0),
  constraint streak_target_ladders_stake_max_ok check (
    stake_cents_max is null or stake_cents_max >= stake_cents_min
  ),
  constraint streak_target_ladders_targets_nonneg check (
    target_1 >= 0 and target_2 >= 0 and target_3 >= 0
  ),
  constraint streak_target_ladders_ascending check (
    target_1 <= target_2 and target_2 <= target_3
  )
);

create index if not exists streak_target_ladders_lookup_idx
  on streak_target_ladders (game_id, is_active, stake_cents_min);

insert into streak_target_ladders (
  game_id, stake_cents_min, stake_cents_max, target_1, target_2, target_3, version, is_active
)
select 'basketball_v1', 0, null, 12, 15, 18, 1, true
where not exists (
  select 1 from streak_target_ladders
  where game_id = 'basketball_v1' and is_active = true
);

alter table streaks
  add column if not exists target_score_1 integer,
  add column if not exists target_score_2 integer,
  add column if not exists target_score_3 integer,
  add column if not exists expires_at timestamptz,
  add column if not exists current_leg smallint not null default 1,
  add column if not exists ladder_id uuid,
  add column if not exists fail_reason text,
  add column if not exists continue_idempotency_key uuid,
  add column if not exists abandon_idempotency_key uuid;

update streaks
set
  target_score_1 = coalesce(target_score_1, target_score, 12),
  target_score_2 = coalesce(target_score_2, greatest(coalesce(target_score, 12), 15)),
  target_score_3 = coalesce(target_score_3, greatest(coalesce(target_score, 12), 18)),
  expires_at = coalesce(expires_at, created_at + interval '24 hours'),
  current_leg = coalesce(nullif(current_leg, 0), 1)
where target_score_1 is null
   or target_score_2 is null
   or target_score_3 is null
   or expires_at is null;

alter table streaks
  alter column target_score_1 set not null,
  alter column target_score_2 set not null,
  alter column target_score_3 set not null,
  alter column expires_at set not null;

alter table streaks drop constraint if exists streaks_current_leg_range;
alter table streaks
  add constraint streaks_current_leg_range check (current_leg between 1 and 3);

alter table streaks drop constraint if exists streaks_fail_reason_check;
alter table streaks
  add constraint streaks_fail_reason_check check (
    fail_reason is null
    or fail_reason in ('lost_leg', 'expired', 'abandoned', 'zeroed')
  );

alter table streaks drop constraint if exists streaks_ladder_id_fkey;
alter table streaks
  add constraint streaks_ladder_id_fkey
  foreign key (ladder_id) references streak_target_ladders (id) on delete restrict;

create unique index if not exists streaks_continue_idempotency_key_key
  on streaks (continue_idempotency_key)
  where continue_idempotency_key is not null;

create unique index if not exists streaks_abandon_idempotency_key_key
  on streaks (abandon_idempotency_key)
  where abandon_idempotency_key is not null;

create index if not exists streaks_active_expires_at_idx
  on streaks (expires_at)
  where status = 'active';

alter table matches
  add column if not exists streak_id uuid,
  add column if not exists streak_leg smallint;

alter table matches drop constraint if exists matches_streak_id_fkey;
alter table matches
  add constraint matches_streak_id_fkey
  foreign key (streak_id) references streaks (id) on delete restrict;

alter table matches drop constraint if exists matches_streak_leg_range;
alter table matches
  add constraint matches_streak_leg_range check (
    streak_leg is null or streak_leg between 1 and 3
  );

alter table matches drop constraint if exists matches_streak_leg_with_id;
alter table matches
  add constraint matches_streak_leg_with_id check (
    (streak_id is null and streak_leg is null)
    or (streak_id is not null and streak_leg is not null)
  );

alter table streak_target_ladders enable row level security;
revoke all on table streak_target_ladders from anon, authenticated, public;
grant all on table streak_target_ladders to service_role;

comment on table streak_target_ladders is
  'Ops-tunable streak ladders (DECISIONS §11.1). Assigned and frozen onto streaks at start.';
comment on column streaks.target_score_1 is
  'Frozen leg-1 target at startStreak.';
comment on column streaks.expires_at is
  '24h wall clock from start; expiry = forfeit, no refund (§11.2).';
comment on column matches.streak_leg is
  '1..3 when mode = streak; null for pvp_1v1.';
