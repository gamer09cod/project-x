-- project-x initial schema
-- PostgreSQL 15 / Supabase
-- Money is integer cents. The ONLY wallet mutation path is apply_ledger_entry().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type user_status as enum ('active', 'suspended', 'banned');

create type ledger_entry_type as enum (
  'WAGER_DEBIT',
  'STREAK_WAGER_DEBIT',
  'WAGER_REFUND',
  'DRAW_REFUND',
  'MATCH_TIMEOUT_REFUND',
  'PAYOUT_CREDIT',
  'STREAK_PAYOUT_CREDIT',
  'ADMIN_CREDIT',
  'ADMIN_DEBIT'
);

create type match_mode as enum ('pvp_1v1', 'streak');

create type match_status as enum (
  'pending',
  'live',
  'open',
  'paired',
  'settled',
  'timeout_refunded',
  'void'
);

create type match_player_status as enum (
  'pending',
  'running',
  'scored',
  'zeroed_timeout',
  'settled'
);

create type boost_type as enum ('prize_boost');

create type boost_status as enum ('available', 'consumed', 'expired');

create type streak_status as enum ('active', 'won', 'lost', 'cashed_out');

-- ---------------------------------------------------------------------------
-- users
-- Firebase Auth is the identity provider. firebase_uid is the stable external id.
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  display_name text,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_firebase_uid_key unique (firebase_uid),
  constraint users_firebase_uid_not_blank check (char_length(firebase_uid) > 0)
);

-- ---------------------------------------------------------------------------
-- wallets
-- 1:1 with users. balance_cents is a cache of sum(ledger.delta_cents).
-- Never write this table except: INSERT of a zero wallet, or UPDATE via
-- apply_ledger_entry().
-- ---------------------------------------------------------------------------

create table wallets (
  user_id uuid primary key references users (id) on delete restrict,
  balance_cents bigint not null default 0,
  lock_version integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_balance_cents_non_negative check (balance_cents >= 0),
  constraint wallets_lock_version_non_negative check (lock_version >= 0)
);

-- ---------------------------------------------------------------------------
-- matches
-- seeded_from_streak_id is filled when a streak score is injected into the
-- 1v1 open pool. The streak PvE row stays mode = 'streak'; the pool row is
-- a separate mode = 'pvp_1v1' match.
-- ---------------------------------------------------------------------------

create table matches (
  id uuid primary key default gen_random_uuid(),
  game_id text not null default 'basketball_v1',
  mode match_mode not null,
  status match_status not null default 'pending',
  stake_cents bigint not null,
  opened_at timestamptz,
  matchmaking_expires_at timestamptz,
  settled_at timestamptz,
  seeded_from_streak_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_game_id_not_blank check (char_length(game_id) > 0),
  constraint matches_stake_cents_positive check (stake_cents > 0),
  constraint matches_open_has_expiry check (
    status <> 'open'
    or (opened_at is not null and matchmaking_expires_at is not null)
  ),
  constraint matches_settled_has_timestamp check (
    status <> 'settled' or settled_at is not null
  ),
  constraint matches_seed_is_pvp check (
    seeded_from_streak_id is null or mode = 'pvp_1v1'
  )
);

-- ---------------------------------------------------------------------------
-- boosts (user inventory instances)
-- prize_boost: bonus_bps = 1500 means +15% on a win payout.
-- On a draw the instance returns to available and expires_at is reset to
-- now() + ttl_seconds (see Functions; columns exist to make that atomic).
-- ---------------------------------------------------------------------------

create table boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  boost_type boost_type not null default 'prize_boost',
  bonus_bps integer not null default 1500,
  status boost_status not null default 'available',
  ttl_seconds integer not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_in_match_id uuid references matches (id) on delete restrict,
  last_refunded_at timestamptz,
  last_refunded_match_id uuid references matches (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boosts_bonus_bps_positive check (bonus_bps > 0),
  constraint boosts_ttl_seconds_positive check (ttl_seconds > 0),
  constraint boosts_consumed_shape check (
    (status = 'consumed'
      and consumed_at is not null
      and consumed_in_match_id is not null)
    or (status <> 'consumed'
      and consumed_at is null
      and consumed_in_match_id is null)
  )
);

-- ---------------------------------------------------------------------------
-- match_players
-- Stake is debited when started_at is set (match start). score_deadline_at is
-- started_at + 75 seconds. Missing score => cron writes score = 0 and
-- zeroed_for_disconnect = true.
-- ---------------------------------------------------------------------------

create table match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete restrict,
  user_id uuid not null references users (id) on delete restrict,
  seat smallint not null,
  status match_player_status not null default 'pending',
  stake_cents bigint not null,
  boost_id uuid references boosts (id) on delete restrict,
  started_at timestamptz,
  score_deadline_at timestamptz,
  score integer,
  score_submitted_at timestamptz,
  score_payload jsonb,
  zeroed_for_disconnect boolean not null default false,
  join_idempotency_key uuid not null,
  submit_idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_players_match_user_key unique (match_id, user_id),
  constraint match_players_match_seat_key unique (match_id, seat),
  constraint match_players_join_idempotency_key_key unique (join_idempotency_key),
  constraint match_players_submit_idempotency_key_key unique (submit_idempotency_key),
  constraint match_players_seat_range check (seat in (1, 2)),
  constraint match_players_stake_cents_positive check (stake_cents > 0),
  constraint match_players_score_non_negative check (score is null or score >= 0),
  constraint match_players_running_has_start check (
    status <> 'running' or started_at is not null
  ),
  constraint match_players_scored_has_score check (
    status <> 'scored' or (score is not null and score_submitted_at is not null)
  ),
  constraint match_players_zeroed_has_score check (
    status <> 'zeroed_timeout' or (score = 0 and zeroed_for_disconnect = true)
  )
);

-- ---------------------------------------------------------------------------
-- streaks
-- PvE vs a target score. On score submit, Functions insert a sibling
-- matches row (mode = pvp_1v1, status = open) and set seeded_pvp_match_id.
-- multiplier_bps: 10000 = 1.00x, 25000 = 2.50x. Payout uses floor().
-- ---------------------------------------------------------------------------

create table streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  stake_cents bigint not null,
  multiplier_bps integer not null,
  streak_count integer not null default 0,
  status streak_status not null default 'active',
  target_score integer,
  actual_score integer,
  pve_match_id uuid references matches (id) on delete restrict,
  seeded_pvp_match_id uuid references matches (id) on delete restrict,
  start_idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint streaks_start_idempotency_key_key unique (start_idempotency_key),
  constraint streaks_stake_cents_positive check (stake_cents > 0),
  constraint streaks_multiplier_bps_min_1x check (multiplier_bps >= 10000),
  constraint streaks_streak_count_non_negative check (streak_count >= 0),
  constraint streaks_target_score_non_negative check (
    target_score is null or target_score >= 0
  ),
  constraint streaks_actual_score_non_negative check (
    actual_score is null or actual_score >= 0
  )
);

alter table matches
  add constraint matches_seeded_from_streak_id_fkey
  foreign key (seeded_from_streak_id) references streaks (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- ledger (append-only)
-- delta_cents is signed. Credits > 0, debits < 0.
-- balance_after_cents is the wallet snapshot after this row.
-- client_idempotency_key is the key the client sent; idempotency_key is the
-- unique row key (may be derived when one request writes several entries).
-- ---------------------------------------------------------------------------

create table ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_user_id uuid not null references wallets (user_id) on delete restrict,
  entry_type ledger_entry_type not null,
  delta_cents bigint not null,
  balance_after_cents bigint not null,
  idempotency_key uuid not null,
  client_idempotency_key uuid not null,
  match_id uuid references matches (id) on delete restrict,
  boost_id uuid references boosts (id) on delete restrict,
  streak_id uuid references streaks (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ledger_idempotency_key_key unique (idempotency_key),
  constraint ledger_client_entry_wallet_key unique (
    client_idempotency_key, entry_type, wallet_user_id
  ),
  constraint ledger_delta_cents_nonzero check (delta_cents <> 0),
  constraint ledger_balance_after_non_negative check (balance_after_cents >= 0),
  constraint ledger_delta_sign_matches_type check (
    (
      entry_type in (
        'WAGER_DEBIT',
        'STREAK_WAGER_DEBIT',
        'ADMIN_DEBIT'
      )
      and delta_cents < 0
    )
    or (
      entry_type in (
        'WAGER_REFUND',
        'DRAW_REFUND',
        'MATCH_TIMEOUT_REFUND',
        'PAYOUT_CREDIT',
        'STREAK_PAYOUT_CREDIT',
        'ADMIN_CREDIT'
      )
      and delta_cents > 0
    )
  )
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index ledger_wallet_created_at_idx
  on ledger (wallet_user_id, created_at desc);

create index matches_open_pool_idx
  on matches (game_id, stake_cents, created_at)
  where status = 'open';

create index matches_matchmaking_expiry_idx
  on matches (matchmaking_expires_at)
  where status = 'open';

create index match_players_score_deadline_idx
  on match_players (score_deadline_at)
  where status = 'running';

create index match_players_user_id_idx
  on match_players (user_id, created_at desc);

create index boosts_available_idx
  on boosts (user_id, expires_at)
  where status = 'available';

create unique index streaks_one_active_per_user_idx
  on streaks (user_id)
  where status = 'active';

create index streaks_user_id_idx
  on streaks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger wallets_set_updated_at
  before update on wallets
  for each row execute function set_updated_at();

create trigger matches_set_updated_at
  before update on matches
  for each row execute function set_updated_at();

create trigger match_players_set_updated_at
  before update on match_players
  for each row execute function set_updated_at();

create trigger boosts_set_updated_at
  before update on boosts
  for each row execute function set_updated_at();

create trigger streaks_set_updated_at
  before update on streaks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a zero wallet with the user
-- ---------------------------------------------------------------------------

create or replace function users_create_wallet()
returns trigger
language plpgsql
as $$
begin
  insert into wallets (user_id, balance_cents) values (new.id, 0);
  return new;
end;
$$;

create trigger users_create_wallet
  after insert on users
  for each row execute function users_create_wallet();

-- ---------------------------------------------------------------------------
-- Business-rule clocks
-- 15-minute matchmaking window when a match enters 'open'
-- 75-second score deadline when a run starts
-- ---------------------------------------------------------------------------

create or replace function matches_set_matchmaking_window()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    if new.opened_at is null then
      new.opened_at := now();
    end if;
    if new.matchmaking_expires_at is null then
      new.matchmaking_expires_at := new.opened_at + interval '15 minutes';
    end if;
  end if;
  return new;
end;
$$;

create trigger matches_set_matchmaking_window
  before insert or update of status on matches
  for each row execute function matches_set_matchmaking_window();

create or replace function match_players_set_score_deadline()
returns trigger
language plpgsql
as $$
begin
  if new.started_at is not null
     and (tg_op = 'INSERT' or old.started_at is null) then
    new.score_deadline_at := new.started_at + interval '75 seconds';
  end if;
  return new;
end;
$$;

create trigger match_players_set_score_deadline
  before insert or update of started_at on match_players
  for each row execute function match_players_set_score_deadline();

-- Stake on a player row must match the match. Seat 2 is PvP only.
-- Streak matches allow exactly one player; PvP allows at most two.

create or replace function match_players_enforce_match_rules()
returns trigger
language plpgsql
as $$
declare
  v_match matches;
  v_count integer;
begin
  select * into v_match from matches where id = new.match_id;
  if not found then
    raise exception 'match not found';
  end if;

  if new.stake_cents <> v_match.stake_cents then
    raise exception 'match_players.stake_cents must equal matches.stake_cents';
  end if;

  if v_match.mode = 'streak' and new.seat <> 1 then
    raise exception 'streak matches only allow seat 1';
  end if;

  select count(*) into v_count
  from match_players
  where match_id = new.match_id
    and (tg_op = 'INSERT' or id <> new.id);

  if v_match.mode = 'streak' and v_count >= 1 then
    raise exception 'streak matches allow exactly one player';
  end if;

  if v_match.mode = 'pvp_1v1' and v_count >= 2 then
    raise exception 'pvp_1v1 matches allow at most two players';
  end if;

  return new;
end;
$$;

create trigger match_players_enforce_match_rules
  before insert or update of match_id, seat, stake_cents on match_players
  for each row execute function match_players_enforce_match_rules();

-- ---------------------------------------------------------------------------
-- Append-only ledger + wallet write guard
-- ---------------------------------------------------------------------------

create or replace function ledger_forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger is append-only';
end;
$$;

create trigger ledger_forbid_update
  before update on ledger
  for each row execute function ledger_forbid_mutation();

create trigger ledger_forbid_delete
  before delete on ledger
  for each row execute function ledger_forbid_mutation();

create or replace function wallets_forbid_nonzero_insert()
returns trigger
language plpgsql
as $$
begin
  if new.balance_cents <> 0 then
    raise exception 'wallets must be inserted with balance_cents = 0';
  end if;
  return new;
end;
$$;

create trigger wallets_forbid_nonzero_insert
  before insert on wallets
  for each row execute function wallets_forbid_nonzero_insert();

create or replace function wallets_require_ledger_function()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.wallet_write', true) is distinct from 'apply_ledger_entry' then
    raise exception 'wallets may only be updated by apply_ledger_entry()';
  end if;
  return new;
end;
$$;

create trigger wallets_require_ledger_function
  before update on wallets
  for each row execute function wallets_require_ledger_function();

create or replace function ledger_require_apply_function()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.ledger_write', true) is distinct from 'apply_ledger_entry' then
    raise exception 'ledger rows may only be inserted by apply_ledger_entry()';
  end if;
  return new;
end;
$$;

create trigger ledger_require_apply_function
  before insert on ledger
  for each row execute function ledger_require_apply_function();

-- ---------------------------------------------------------------------------
-- apply_ledger_entry
-- Callers MUST pass already-floored integer cents (no numeric/float).
-- Idempotent on p_idempotency_key.
-- ---------------------------------------------------------------------------

create or replace function apply_ledger_entry(
  p_user_id uuid,
  p_entry_type ledger_entry_type,
  p_delta_cents bigint,
  p_idempotency_key uuid,
  p_client_idempotency_key uuid,
  p_match_id uuid default null,
  p_boost_id uuid default null,
  p_streak_id uuid default null
)
returns ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing ledger;
  v_wallet wallets;
  v_new_balance bigint;
  v_row ledger;
begin
  select * into v_existing
  from ledger
  where idempotency_key = p_idempotency_key;

  if found then
    return v_existing;
  end if;

  if p_delta_cents = 0 then
    raise exception 'delta_cents must be a non-zero integer';
  end if;

  select * into v_wallet
  from wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  v_new_balance := v_wallet.balance_cents + p_delta_cents;

  if v_new_balance < 0 then
    raise exception 'insufficient_funds';
  end if;

  perform set_config('app.wallet_write', 'apply_ledger_entry', true);
  perform set_config('app.ledger_write', 'apply_ledger_entry', true);

  update wallets
  set
    balance_cents = v_new_balance,
    lock_version = lock_version + 1
  where user_id = p_user_id;

  insert into ledger (
    wallet_user_id,
    entry_type,
    delta_cents,
    balance_after_cents,
    idempotency_key,
    client_idempotency_key,
    match_id,
    boost_id,
    streak_id
  ) values (
    p_user_id,
    p_entry_type,
    p_delta_cents,
    v_new_balance,
    p_idempotency_key,
    p_client_idempotency_key,
    p_match_id,
    p_boost_id,
    p_streak_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function apply_ledger_entry(
  uuid, ledger_entry_type, bigint, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function apply_ledger_entry(
  uuid, ledger_entry_type, bigint, uuid, uuid, uuid, uuid, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: deny-all for anon/authenticated. service_role bypasses RLS.
-- Device clients never talk to these tables directly in v1.
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table wallets enable row level security;
alter table ledger enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table boosts enable row level security;
alter table streaks enable row level security;

revoke all on table users from anon, authenticated, public;
revoke all on table wallets from anon, authenticated, public;
revoke all on table ledger from anon, authenticated, public;
revoke all on table matches from anon, authenticated, public;
revoke all on table match_players from anon, authenticated, public;
revoke all on table boosts from anon, authenticated, public;
revoke all on table streaks from anon, authenticated, public;

grant all on table users to service_role;
grant all on table wallets to service_role;
grant all on table ledger to service_role;
grant all on table matches to service_role;
grant all on table match_players to service_role;
grant all on table boosts to service_role;
grant all on table streaks to service_role;

comment on table ledger is
  'Append-only money log. Integer cents only. Written solely by apply_ledger_entry.';
comment on column wallets.balance_cents is
  'Cached integer cents. $1.25 = 125. Must never be written with floating point.';
comment on column matches.matchmaking_expires_at is
  'opened_at + 15 minutes. Cron refunds via MATCH_TIMEOUT_REFUND. No auto-wins.';
comment on column match_players.score_deadline_at is
  'started_at + 75 seconds (60s game + 15s buffer). Miss => score 0.';
comment on column boosts.bonus_bps is
  'Win payout bonus in basis points. 1500 = +15%. Floor to cents in Functions.';
comment on column streaks.multiplier_bps is
  '10000 = 1.00x, 25000 = 2.50x. Floor to cents in Functions.';
