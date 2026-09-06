-- Streak resume + per-leg scores / continue keys (DECISIONS §11).
-- Freeze already lives on target_score_1..3; this adds display scores and
-- idempotency that is not overwritten when starting leg 3.

alter table streaks
  add column if not exists leg_score_1 integer,
  add column if not exists leg_score_2 integer,
  add column if not exists leg_score_3 integer,
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz;

alter table streaks drop constraint if exists streaks_leg_score_1_nonneg;
alter table streaks drop constraint if exists streaks_leg_score_2_nonneg;
alter table streaks drop constraint if exists streaks_leg_score_3_nonneg;
alter table streaks
  add constraint streaks_leg_score_1_nonneg check (leg_score_1 is null or leg_score_1 >= 0),
  add constraint streaks_leg_score_2_nonneg check (leg_score_2 is null or leg_score_2 >= 0),
  add constraint streaks_leg_score_3_nonneg check (leg_score_3 is null or leg_score_3 >= 0);

create table if not exists streak_leg_idempotency (
  idempotency_key uuid primary key,
  streak_id uuid not null references streaks (id) on delete restrict,
  kind text not null,
  leg smallint not null,
  created_at timestamptz not null default now(),
  constraint streak_leg_idempotency_kind_check check (kind in ('continue')),
  constraint streak_leg_idempotency_leg_range check (leg between 2 and 3)
);

create unique index if not exists streak_leg_idempotency_one_key_per_leg
  on streak_leg_idempotency (streak_id, kind, leg);

alter table streak_leg_idempotency enable row level security;
revoke all on table streak_leg_idempotency from anon, authenticated, public;
grant all on table streak_leg_idempotency to service_role;

comment on column streaks.leg_score_1 is
  'Accepted score for leg 1 after submit; null if unplayed.';
comment on column streaks.completed_at is
  'Set when status becomes won (leg 3 clear + payout).';
comment on column streaks.failed_at is
  'Set when status becomes lost (miss, abandon, expiry, zero).';
comment on table streak_leg_idempotency is
  'Per-leg continueStreak idempotency; one key per (streak, leg).';
