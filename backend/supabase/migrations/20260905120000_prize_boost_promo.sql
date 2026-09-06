-- Prize Boost: catalog, promotional budgets, match snapshots, PROMO_BOOST ledger.
-- Inventory remains `boosts`. Settlement must use match_players snapshot columns.

alter type ledger_entry_type add value if not exists 'PROMO_BOOST';

create table if not exists promo_budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  allocated_cents bigint not null,
  reserved_cents bigint not null default 0,
  spent_cents bigint not null default 0,
  max_per_match_cents bigint not null,
  max_per_player_period_cents bigint not null,
  period_hours integer not null default 24,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_budgets_name_not_blank check (char_length(name) > 0),
  constraint promo_budgets_allocated_non_negative check (allocated_cents >= 0),
  constraint promo_budgets_reserved_non_negative check (reserved_cents >= 0),
  constraint promo_budgets_spent_non_negative check (spent_cents >= 0),
  constraint promo_budgets_max_match_non_negative check (max_per_match_cents >= 0),
  constraint promo_budgets_max_player_non_negative check (max_per_player_period_cents >= 0),
  constraint promo_budgets_period_hours_positive check (period_hours > 0),
  constraint promo_budgets_exposure_within_alloc check (
    reserved_cents + spent_cents <= allocated_cents
  )
);

create table if not exists boost_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  percentage_bps integer not null,
  game_id text not null default 'basketball_v1',
  game_mode match_mode not null default 'pvp_1v1',
  max_wager_cents bigint not null,
  expires_after_hours integer not null,
  promo_budget_id uuid not null references promo_budgets (id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boost_catalog_name_not_blank check (char_length(name) > 0),
  constraint boost_catalog_percentage_bps_positive check (percentage_bps > 0),
  constraint boost_catalog_percentage_bps_cap check (percentage_bps <= 50000),
  constraint boost_catalog_max_wager_non_negative check (max_wager_cents >= 0),
  constraint boost_catalog_expires_after_hours_positive check (expires_after_hours > 0),
  constraint boost_catalog_game_id_not_blank check (char_length(game_id) > 0)
);

create table if not exists promo_player_periods (
  id uuid primary key default gen_random_uuid(),
  promo_budget_id uuid not null references promo_budgets (id) on delete restrict,
  user_id uuid not null references users (id) on delete restrict,
  period_date date not null,
  reserved_cents bigint not null default 0,
  spent_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint promo_player_periods_unique unique (promo_budget_id, user_id, period_date),
  constraint promo_player_periods_reserved_non_negative check (reserved_cents >= 0),
  constraint promo_player_periods_spent_non_negative check (spent_cents >= 0)
);

alter table boosts
  add column if not exists catalog_id uuid references boost_catalog (id) on delete restrict,
  add column if not exists game_id text,
  add column if not exists game_mode match_mode,
  add column if not exists max_wager_cents bigint,
  add column if not exists promo_budget_id uuid references promo_budgets (id) on delete restrict;

alter table match_players
  add column if not exists boost_bonus_bps integer,
  add column if not exists boost_max_wager_cents bigint,
  add column if not exists boost_promo_budget_id uuid references promo_budgets (id) on delete restrict,
  add column if not exists boost_promo_reserved_cents bigint not null default 0,
  add column if not exists boost_promo_exposure_cents bigint not null default 0;

alter table ledger
  drop constraint if exists ledger_delta_sign_matches_type;

alter table ledger
  add constraint ledger_delta_sign_matches_type check (
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
        'PROMO_BOOST',
        'ADMIN_CREDIT'
      )
      and delta_cents > 0
    )
  );

create index if not exists boosts_user_status_idx
  on boosts (user_id, status);

create index if not exists boosts_user_expires_idx
  on boosts (user_id, expires_at);

create index if not exists boost_catalog_game_mode_active_idx
  on boost_catalog (game_id, game_mode, is_active);

create index if not exists promo_budgets_active_idx
  on promo_budgets (id)
  where active;

create index if not exists match_players_boost_id_idx
  on match_players (boost_id)
  where boost_id is not null;

create index if not exists match_players_promo_budget_idx
  on match_players (boost_promo_budget_id)
  where boost_promo_budget_id is not null;

create index if not exists promo_player_periods_user_idx
  on promo_player_periods (user_id, period_date);

insert into promo_budgets (
  id,
  name,
  allocated_cents,
  max_per_match_cents,
  max_per_player_period_cents,
  period_hours,
  active
)
values (
  '11111111-1111-4111-8111-111111111111',
  'mvp_default',
  100000000,
  50000,
  200000,
  24,
  true
)
on conflict (id) do nothing;

insert into boost_catalog (
  id,
  name,
  percentage_bps,
  game_id,
  game_mode,
  max_wager_cents,
  expires_after_hours,
  promo_budget_id,
  is_active
)
values (
  '22222222-2222-4222-8222-222222222222',
  '+25% Prize Boost',
  2500,
  'basketball_v1',
  'pvp_1v1',
  10000,
  24,
  '11111111-1111-4111-8111-111111111111',
  true
)
on conflict (id) do nothing;

update boosts
set
  catalog_id = coalesce(catalog_id, '22222222-2222-4222-8222-222222222222'),
  game_id = coalesce(game_id, 'basketball_v1'),
  game_mode = coalesce(game_mode, 'pvp_1v1'),
  max_wager_cents = coalesce(max_wager_cents, 10000),
  promo_budget_id = coalesce(
    promo_budget_id,
    '11111111-1111-4111-8111-111111111111'
  )
where catalog_id is null
   or game_id is null
   or game_mode is null
   or max_wager_cents is null
   or promo_budget_id is null;

alter table promo_budgets enable row level security;
alter table boost_catalog enable row level security;
alter table promo_player_periods enable row level security;

revoke all on table promo_budgets from anon, authenticated, public;
revoke all on table boost_catalog from anon, authenticated, public;
revoke all on table promo_player_periods from anon, authenticated, public;

grant all on table promo_budgets to service_role;
grant all on table boost_catalog to service_role;
grant all on table promo_player_periods to service_role;

comment on table promo_budgets is
  'Company-funded prize-boost exposure. reserved + spent must stay <= allocated.';
comment on table boost_catalog is
  'Boost definitions. Inventory instances live in boosts.';
comment on column match_players.boost_bonus_bps is
  'Snapshot of bonus_bps at join. Settlement must not re-read live inventory.';
comment on column match_players.boost_promo_reserved_cents is
  'Outstanding promo reservation for this seat. Zero after spend or release.';
