# Database schema (Step 2)

Source of truth: `backend/supabase/migrations/0001_init.sql`.
PostgreSQL 15. All money columns are `bigint` integer cents (`$1.25 = 125`).

## Tables

| Table | Cardinality | Role |
|---|---|---|
| `users` | 1 per Firebase account | Profile. `firebase_uid` unique. |
| `wallets` | 1:1 with `users` | `balance_cents` cache. Inserted at 0 by trigger. |
| `ledger` | append-only | Every balance change. Signed `delta_cents`. |
| `matches` | 1 per run or pool posting | `pvp_1v1` or `streak`. |
| `match_players` | 1–2 per match | Seat, stake, score, 75s deadline. |
| `boosts` | inventory instances | `prize_boost` with `bonus_bps` (1500 = +15%). |
| `streaks` | 1 active per user | PvE run + pointer to injected open 1v1. |

Device roles (`anon`, `authenticated`) have **no** table grants. RLS is on; v1 access is `service_role` from Firebase Functions only.

## Money path

1. Functions compute any multiplier in integer math and `Math.floor` to cents.
2. Functions call `apply_ledger_entry(...)`.
3. That function `SELECT ... FOR UPDATE`s the wallet, writes `wallets` and `ledger` in the same transaction, and is the only caller allowed to do either.

Direct `UPDATE wallets` or `INSERT ledger` raises. `ledger` rejects `UPDATE` and `DELETE`.

Idempotency: `ledger.idempotency_key` is unique (row key, may be derived). `(client_idempotency_key, entry_type, wallet_user_id)` is also unique so one client request cannot double-pay the same entry type for the same wallet.

## Matchmaking and disconnects

| Rule | Encoded as |
|---|---|
| 15 minute open-match timeout | `matches` entering `open` sets `opened_at` and `matchmaking_expires_at = opened_at + 15 minutes`. Cron refunds with `MATCH_TIMEOUT_REFUND`. No auto-win. |
| 75 second crash-scum window | Setting `match_players.started_at` sets `score_deadline_at = started_at + 75 seconds`. Cron settles `score = 0`, `zeroed_for_disconnect = true`. |
| Stake equals match | Trigger: `match_players.stake_cents = matches.stake_cents`. |
| Streak is 1 player; 1v1 is ≤2 | Trigger on `match_players`. Seat 2 is PvP only. |

## Streak injection

A streak run is `matches.mode = 'streak'` plus a `streaks` row. After score submit, Functions insert a **separate** `matches` row (`mode = 'pvp_1v1'`, `status = 'open'`, `seeded_from_streak_id = streaks.id`) and set `streaks.seeded_pvp_match_id`. The PvE score becomes seat 1 on that pool match. It is not a second wallet debit.

## Boosts on draws

Inventory row returns to `status = 'available'`, `consumed_at` / `consumed_in_match_id` cleared, `expires_at = now() + ttl_seconds`, `last_refunded_at` / `last_refunded_match_id` set. Wager refund is a `DRAW_REFUND` ledger row, not a boost table write.

## Multipliers (integer only)

| Concept | Storage | Example |
|---|---|---|
| Prize boost | `boosts.bonus_bps` | 1500 → +15% |
| Streak payout | `streaks.multiplier_bps` | 25000 → 2.50x (`10000` = 1x) |

House keeps the fractional cent after `Math.floor`.

## `score_payload`

`match_players.score_payload jsonb` is an audit blob. Verification methodology (including `hasUsedBuzzerBeater`) is Step 4, not this migration.
