# Decisions

Locked during project scaffolding (3 September 2026). New decisions append below; do not silently rewrite history — strike and replace with a dated entry.

Related: [`README.md`](README.md), [`docs/architecture/VERSION_MATRIX.md`](docs/architecture/VERSION_MATRIX.md), [`docs/architecture/BOUNDARIES.md`](docs/architecture/BOUNDARIES.md), [`docs/schema/SCHEMA.md`](docs/schema/SCHEMA.md), [`docs/backend/REQUIREMENTS.md`](docs/backend/REQUIREMENTS.md).

---

## 1. Threat model

The client (Unity + React Native) is untrusted. The attacker is a modified APK/IPA, a patched Unity player, a replayed HTTPS callable, or a dropped connection after the stake is posted.

### 1.1 Assets

| Asset | Why it matters |
|---|---|
| `wallets.balance_cents` | Real money, integer cents |
| `users.rating` | Display only; must not affect pairing |
| `ledger` | Append-only audit of every debit/credit |
| Match outcome / `score_payload` | Determines payouts |
| Boost inventory | Paid (or granted) items that change EV |
| Firebase Auth session | Maps to `users.firebase_uid` |
| `DATABASE_URL` | Direct Postgres; never on device |

### 1.2 Actors

| Actor | Trust |
|---|---|
| Unity process | None. May lie about score, clock, buzzer-beater, or disconnect. |
| React Native process | None. May replay callables, skip submit, or mint extra `idempotency_key`s. |
| Firebase Functions | Trusted compute. Must verify App Check + ID token. |
| PostgreSQL | Trusted store. Enforces cents, append-only ledger, wallet write guard. |
| Scheduled jobs | Trusted. 15-minute matchmaking refund; 75-second zero-score. |

### 1.3 Threats (concrete)

| Threat | How someone cheats | Control | Holes |
|---|---|---|---|
| Fake score | Memory-edit Unity; send `score: 999` | Reconstruct from `shotLog`; mismatch → 0 | Internally consistent fake logs |
| Slowed clock | Stretch the process so more shots fit in “60s” | `durationMs` ≤ `MAX_DURATION_MS` (67s) | Cheats inside the cap |
| Infinite buzzer-beater | Trigger +5s repeatedly | At most one buzzer-beater event | Lie in the log if it stays consistent |
| Replay | Double-tap join/submit | Unique `idempotency_key`s | Stolen key still needs that user’s token |
| Modified build | Sideloaded APK with auto-aim | `unityBuildId` allowlist (Phase 9) | Until then, any build is accepted |
| Scripted input | Perfect bot in a legit build | None in v1 | Next week: heuristics |
| Crash-scum | Kill app after debit | 75s cron zeros score | Delay right at the deadline |
| Pool timeout theft | Never get an opponent, keep the stake | 15m `MATCH_TIMEOUT_REFUND`; rating unchanged | — |
| Direct table writes | Stolen client key | RLS deny-all; Functions use `pg` + `DATABASE_URL` | Leaked DB URL is game over |
| Wallet without ledger | Raw `UPDATE wallets` | `apply_ledger_entry` only | — |

**First defence to ship (Phase 7):** duration cap + monotone `shotLog` + reconstruct vs claimed score. It catches inflated scores that do not match the log, extra buzzer-beaters, and over-long runs. It does **not** catch a bot that plays a legal log, or a patched client that forges a coherent log.

**Next week (order):** `unityBuildId` fail-closed → App Check on all money callables → submit rate limits → simple shot-timing heuristics.

### 1.4 Out of scope for v1

- Real payment processor, cards, webhooks (mock `ADMIN_CREDIT` / `ADMIN_DEBIT` only)
- KYC / geofencing
- Spectators and public match feeds
- Device-side Postgres access

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

TypeScript: `packages/shared` (`ScorePayloadV1`). Semantic requirements:

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
4. **Clock bound** — `durationMs` ≤ 60_000 + 5_000 + 2_000 (`MAX_DURATION_MS`). Multiple +5s extensions are invalid.
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
| A5 | Unity | ~~6000.1.13f1~~ **replaced 3 Sep 2026 by A5b** | 6.3 LTS, 6.0 LTS, 2022.3 |
| A5b | Unity | **6000.3.18f1** (editor used for Phase 3 Android export) | 6000.1.13f1 |
| A6 | RN ↔ Unity | `@azesmway/react-native-unity` 1.1.1; source in `/unity`, exports in `mobile/unity/builds/` | Expo Unity plugins |
| A7 | Auth | Firebase Auth via RNFirebase 26.3.3 | Firebase JS SDK on device, Supabase Auth |
| A8 | API | Firebase Functions 7.3.2, Node 22, **JavaScript**, admin 14.3.0 | TypeScript Functions, Supabase Edge Functions as money API |
| A9 | Database | ~~Supabase-hosted PostgreSQL 15~~ **replaced 3 Sep 2026 by A9b** | Firestore as source of truth |
| A9b | Database | Supabase-hosted PostgreSQL 17 (live `17.6.1.166`) | PostgreSQL 15 (no longer offered on new hosted projects) |
| A10 | Client DB access | ~~service_role via supabase-js~~ **replaced 3 Sep 2026 by A13** | Anon read of wallets |
| A11 | Money writes | `apply_ledger_entry()` only | ORM updates to `wallets` |
| A12 | Identity PK | Internal `users.id` uuid; `firebase_uid` unique | Firebase UID as PK |
| A13 | Functions → Postgres | `pg` + `query`/`transaction` in `db.js`; `PG_*` / direct 5432 | `@supabase/supabase-js`, ORMs, query builders, TypeScript in Functions |
| A14 | Matchmaking | FCFS same `game_id` + `stake_cents`; rating ignored | ELO-based pairing |
| A15 | Nobody in 15m window | `MATCH_TIMEOUT_REFUND`; no auto-win; no house bot | Silent keep of stake |
| A16 | Rating | Start 1000; win +20; loss −20 (min 0); draw/timeout 0 | K-factor, provisionals, tiers |
| A17 | Payments | Mock `ADMIN_CREDIT` / `ADMIN_DEBIT` only | Stripe/cards/webhooks |
| A18 | New Architecture | ~~**Off** for azesmway Paper spike~~ **replaced 3 Sep 2026 by A18b** | Fabric on for first embed |
| A18b | New Architecture | **On** (RN 0.86 / 0.82+ ignores `newArchEnabled=false`). azesmway 1.1.1 Fabric path used; `jcenter()` removed via patch. | Paper-only embed |
| A19 | Auth provider (Phase 4) | Firebase **email/password** via RNFirebase Auth | Phone auth (deferred) |

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
| S8 | Rating | `users.rating integer not null default 1000 check (>= 0)` |

SQL: `backend/supabase/migrations/20260903120000_init.sql` plus `20260903140000_player_rating.sql`.

Step 2 schema **approved** 3 September 2026.

---

## 6. API contract decisions (Step 3)

| ID | Decision | Choice |
|---|---|---|
| C1 | `durationMs` slack | `SCORE_DURATION_SLACK_MS = 2000`. Max duration = 60s + 5s buzzer-beater + 2s. |
| C2 | Payload schema | `ScorePayloadV1`, `schemaVersion: 1`, in `packages/shared` |
| C3 | Streak boosts | `startStreak` does not take `boostId`. Prize boosts are 1v1 `joinMatch` only in v1. |
| C4 | Target / multiplier | `targetScore` and `multiplierBps` are server-assigned on `startStreak` |

Callable TS: `packages/shared/src/api`. Narrative: `docs/api/CONTRACTS.md`.

---

## 7. Open items (not decided)

- Published shot scoring table (gameplay not specified)
- `unityBuildId` allowlist process
