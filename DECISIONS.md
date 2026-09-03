# Decisions

Locked during project scaffolding (3 September 2026). New decisions append below; do not silently rewrite history — strike and replace with a dated entry.

Related: [`README.md`](README.md), [`docs/architecture/VERSION_MATRIX.md`](docs/architecture/VERSION_MATRIX.md), [`docs/architecture/BOUNDARIES.md`](docs/architecture/BOUNDARIES.md), [`docs/schema/SCHEMA.md`](docs/schema/SCHEMA.md).

---

## 1. Threat model

The client (Unity + React Native) is untrusted. The attacker is a modified APK/IPA, a patched Unity player, a replayed HTTPS callable, or a dropped connection after the stake is posted.

### 1.1 Assets

| Asset | Why it matters |
|---|---|
| `wallets.balance_cents` | Real money, integer cents |
| `ledger` | Append-only audit of every debit/credit |
| Match outcome / `score_payload` | Determines payouts |
| Boost inventory | Paid (or granted) items that change EV |
| Firebase Auth session | Maps to `users.firebase_uid` |
| Supabase service role key | Bypasses RLS; never on device |

### 1.2 Actors

| Actor | Trust |
|---|---|
| Unity process | None. May lie about score, clock, buzzer-beater, or disconnect. |
| React Native process | None. May replay callables, skip submit, or mint extra `idempotency_key`s. |
| Firebase Functions | Trusted compute. Must verify App Check + ID token. |
| PostgreSQL | Trusted store. Enforces cents, append-only ledger, wallet write guard. |
| Scheduled jobs | Trusted. 15-minute matchmaking refund; 75-second zero-score. |

### 1.3 Threats and scaffolding controls

| Threat | Control (in repo now) | Still open |
|---|---|---|
| Fake score | Server is the only writer of `match_players.score`; payload stored for audit | Payload verification methodology (section 3) |
| Replay `joinMatch` / `submitScore` | Unique `join_idempotency_key`, `submit_idempotency_key`, `ledger.idempotency_key` | Callable contracts (Step 3) |
| Crash after debit, no submit | Debit at `started_at`; `score_deadline_at = started_at + 75s`; cron zeros score | Cron implementation |
| Sit in the 1v1 pool forever | `matchmaking_expires_at = opened_at + 15 minutes`; `MATCH_TIMEOUT_REFUND`; no auto-win | Cron implementation |
| Direct table writes from the phone | RLS on; `anon`/`authenticated` revoked; v1 is `service_role` only | Firebase JWT → optional later read path |
| Wallet update without ledger | Triggers: ledger insert + wallet update only via `apply_ledger_entry()` | — |
| Float rounding theft | `bigint` cents; `Math.floor` in Functions before ledger; house keeps fraction | Enforce floor in shared helper (no UI) |
| Self-match vs own streak seed | `(match_id, user_id)` unique | Matchmaking must not pair the same `user_id` |
| Infinite buzzer-beater | Unity flag `hasUsedBuzzerBeater` (gameplay later); payload field in section 3 | Unity + verifier |
| Boost kept after a draw | Draw restores boost to `available` and resets `expires_at`; `DRAW_REFUND` for the stake | Callable settlement |

### 1.4 Out of scope for v1 scaffolding

- Payment processor / cash-out rails
- KYC / geofencing
- Spectators and public match feeds
- Device-side Supabase reads

---

## 2. Resolved ambiguities (business directives)

These are product law. Schema and APIs must implement them, not reinterpret them.

### 2.1 Streak mode vs 1v1

Streak is PvE (player vs `target_score`). A streak score is **silently injected** into the standard 1v1 pool as an open score.

**Scaffolding:** `matches.mode = 'streak'` is the PvE row. After submit, Functions insert a sibling `matches` row (`mode = 'pvp_1v1'`, `status = 'open'`, `seeded_from_streak_id`) and set `streaks.seeded_pvp_match_id`. Seat 1 on the pool match carries the posted score. **No second wager debit.**

### 2.2 Fractional cents

Boosts (e.g. +15%) and streaks (e.g. 2.5x) produce fractional cents. Always `Math.floor` to integer cents before `apply_ledger_entry`. The house keeps the fraction.

**Scaffolding:** money columns are `bigint`. Boosts store `bonus_bps` (1500 = +15%). Streaks store `multiplier_bps` (10000 = 1x, 25000 = 2.5x). No `numeric`/`float` money types.

### 2.3 Matchmaking timeout

If a 1v1 match stays `open` for 15 minutes with no opponent, close it and refund via `MATCH_TIMEOUT_REFUND`. **No auto-wins.**

**Scaffolding:** trigger on transition to `open` sets `opened_at` and `matchmaking_expires_at = opened_at + 15 minutes`. Ledger type `MATCH_TIMEOUT_REFUND` exists (positive `delta_cents`).

### 2.4 Buzzer-beater loop

Unity enforces `hasUsedBuzzerBeater = false` at run start. If the clock hits `0.0` and the ball is in the air, time slows; a make adds 5 seconds. This may happen **once per run**.

**Scaffolding:** not a SQL column. Required field on `score_payload` (section 3). Gameplay code is not written yet.

### 2.5 Crash-scumming (disconnects)

Debit the stake at match start and record `started_at`. If no score arrives within 75 seconds (60s game + 15s buffer), a scheduled job settles the score as `0`.

**Scaffolding:** `match_players.started_at` trigger sets `score_deadline_at = started_at + 75 seconds`. Terminal path `status = 'zeroed_timeout'`, `score = 0`, `zeroed_for_disconnect = true`.

### 2.6 Boosts on draws

If a prize boost was used and the match draws: refund the wager **and** return the boost to inventory with expiry reset.

**Scaffolding:** `DRAW_REFUND` ledger type. Boost row returns to `available`, `consumed_*` cleared, `expires_at = now() + ttl_seconds`, `last_refunded_at` / `last_refunded_match_id` set.

---

## 3. `scorePayload` verification methodology

Unity may send any JSON. Functions persist the blob on `match_players.score_payload` and decide the **accepted score** using this pipeline. Implementation of the callable is Step 3+; this is the locked method.

### 3.1 Transport

1. Unity → React Native bridge (string message). RN does not trust or rescale the score.
2. RN → `submitScore` HTTPS callable with Firebase ID token, App Check, `matchId`, `scorePayload`, `idempotencyKey`.
3. Functions verify token, App Check, match membership, `status = 'running'`, and `now() <= score_deadline_at` (else the 75s job owns settlement).

### 3.2 Required payload shape (contract)

Exact TypeScript lands in Step 3. Semantic requirements:

| Field | Rule |
|---|---|
| `schemaVersion` | Integer; reject unknown versions |
| `score` | Integer ≥ 0; this is a *claim*, not the settlement |
| `durationMs` | Integer; must be consistent with a ~60s run (+ one 5s buzzer-beater) |
| `clockEndedAtMs` | Integer |
| `hasUsedBuzzerBeater` | Boolean |
| `buzzerBeaterTriggered` | Boolean; if true, `hasUsedBuzzerBeater` must be true |
| `shotLog` | Ordered events (time, result) for replay checks |
| `clientRunId` | UUID; bind to the `match_players` row |
| `unityBuildId` | Pinned build fingerprint; reject stale/unknown builds once we ship a allowlist |

Reject the callable (do not zero the score) if the JSON fails schema parse. A **valid** payload on a late submit after `score_deadline_at` is ignored; the zero-score job is authoritative.

### 3.3 Deterministic checks (server)

Run in order; first failure ⇒ accepted score `0` (same as disconnect), payload still stored:

1. **Schema** — all required fields, types, `score >= 0`.
2. **Identity** — `clientRunId` matches the running `match_players` row; user is seat holder.
3. **Once-only buzzer-beater** — at most one event with `buzzerBeaterTriggered`; if `hasUsedBuzzerBeater === false`, there must be zero such events.
4. **Clock bound** — `durationMs` ≤ 60_000 + 5_000 + slack (small constant, TBD in Step 3, not a second 60s). Multiple +5s extensions are invalid.
5. **Monotone shot times** — `shotLog[].t` non-decreasing and within `durationMs`.
6. **Score reconstruction** — claimed `score` must equal the sum implied by `shotLog` under the published scoring table (locked when gameplay is specified). Mismatch ⇒ 0.
7. **Build allowlist** — `unityBuildId` in the current allowlist (empty allowlist in scaffolding = accept all, fail closed before first paid match).

### 3.4 What we will not do in v1

- Trust a Unity-side HMAC as sufficient proof (the key would live in the client).
- Run a full physics re-sim on the server (out of scope until a dedicated validator exists).
- Let RN “fix up” the payload.

### 3.5 Settlement after accept

If checks pass, write `match_players.score` from the reconstructed integer, `status = 'scored'`. Then:

- Streak PvE: update `streaks`, inject open 1v1 seed (section 2.1).
- 1v1 opener: match → `open` (15-minute clock).
- 1v1 closer: compare scores, `Math.floor` payouts, `apply_ledger_entry`, draw path per 2.6.

---

## 4. Scaffolding decisions (architecture)

| ID | Decision | Choice | Rejected |
|---|---|---|---|
| A1 | Monorepo | `/mobile` `/unity` `/backend` `/docs` + `packages/shared` | Polyrepos |
| A2 | Package manager | npm 10.9.3 workspaces, `save-exact=true` | Yarn/pnpm, floating ranges |
| A3 | Mobile shell | Bare React Native 0.86.0 | RN 0.87.1, RN 0.86.3, Expo managed |
| A4 | React | 19.2.3 exact | Any other 19.2.x |
| A5 | Unity | 6000.1.13f1 (user lock) | 6.3 LTS, 6.0 LTS, 2022.3 |
| A6 | RN ↔ Unity | `@azesmway/react-native-unity` 1.1.1; source in `/unity`, exports in `mobile/unity/builds/` | Expo Unity plugins |
| A7 | Auth | Firebase Auth via RNFirebase 26.3.3 | Firebase JS SDK on device, Supabase Auth |
| A8 | API | Firebase Functions 7.3.2, Node 22, admin 14.3.0 | Supabase Edge Functions as money API |
| A9 | Database | Supabase PostgreSQL 15 | Firestore as source of truth |
| A10 | Client DB access | Deny-all RLS; Functions `service_role` only | Anon read of wallets |
| A11 | Money writes | `apply_ledger_entry()` only | ORM updates to `wallets` |
| A12 | Identity PK | Internal `users.id` uuid; `firebase_uid` unique | Firebase UID as PK |

---

## 5. Schema decisions

| ID | Decision | Choice |
|---|---|---|
| S1 | Cents type | `bigint`, checks `>= 0` on balances/stakes, `<> 0` on ledger deltas |
| S2 | Ledger sign | Signed `delta_cents`; type enum must match sign |
| S3 | Idempotency | Unique row `idempotency_key`; unique `(client_idempotency_key, entry_type, wallet_user_id)` |
| S4 | Wallet create | After insert on `users`, wallet at 0 |
| S5 | Streak pool seed | Separate `pvp_1v1` match, not a status on the PvE row |
| S6 | One active streak | Unique index on `streaks.user_id` where `status = 'active'` |
| S7 | Player caps | Trigger: streak = 1 player (seat 1); 1v1 ≤ 2 |

SQL: `backend/supabase/migrations/0001_init.sql`.

---

## 6. Open items (not decided)

- Exact `durationMs` slack constant for section 3.3.4
- Published shot scoring table (gameplay not specified)
- `unityBuildId` allowlist process
- Payment rails / cash-out
- Whether New Architecture stays on after the first `UnityView` device spike
