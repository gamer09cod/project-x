# project-x

Real-money asynchronous 1v1 skill game. Players stake integer cents on a ~60 second 2D basketball run. The React Native shell owns auth, wallet UI, and matchmaking calls. Unity owns the run. Firebase Functions + PostgreSQL own money.

This repo is in **planning / scaffolding**. There is no gameplay or UI implementation yet.

## Stack (pinned, no `^` / `~`)

| Piece | Pin |
|---|---|
| Node.js / npm | 22.18.0 / 10.9.3 |
| React Native | 0.86.0 |
| React | 19.2.3 (exact — renderer mismatch crash otherwise) |
| TypeScript (mobile + `packages/shared` only) | 5.9.3 |
| Firebase Functions | JavaScript (CommonJS) |
| `@azesmway/react-native-unity` | 1.1.1 |
| Unity Editor | 6000.1.13f1 |
| RNFirebase app / auth / functions / app-check | 26.3.3 |
| firebase-admin / firebase-functions | 14.3.0 / 7.3.2 |
| firebase-tools | 15.29.0 |
| PostgreSQL (Supabase-hosted) | 17 |
| `pg` (Functions) | 8.16.3 |
| C# (Unity default) | 9.0 |

Companion `@react-native/*` packages (babel-preset, metro-config, typescript-config, eslint-config, codegen, gradle-plugin) must also be **0.86.0**. Full table: [`docs/architecture/VERSION_MATRIX.md`](docs/architecture/VERSION_MATRIX.md).

## Repository layout

```
project-x/
  mobile/                 React Native iOS + Android
    src/features/{auth,wallet,match,streak,inventory}
    src/bridge/           UnityView + message types only
    src/services/         Firebase + read-only Supabase clients (later)
    unity/builds/{ios,android}   azesmway export target
  unity/                  Unity 6.1 source (6000.1.13f1)
    Assets/Scripts/{Bridge,Gameplay,AntiCheat}
  backend/
    functions/            Firebase Functions (Node 22, JavaScript)
    supabase/migrations/  PostgreSQL source of truth
  packages/shared/        TS types for mobile; JSON contracts for Functions
  docs/
    architecture/         Version matrix, boundaries, architecture diagram
    schema/               Schema narrative
    api/                  Callable contracts
    decisions/            Pointer to root DECISIONS.md
```

npm workspaces: `mobile`, `backend/functions`, `packages/shared`. Unity is not an npm workspace.

## Core rules

1. **Server authority.** Only Firebase Functions + Postgres may mutate wallets, resolve matches, or accept scores.
2. **Integer cents.** `$1.25 = 125`. No floating-point money. Multipliers use `Math.floor` before any ledger write; the house keeps the fraction.
3. **Atomic money.** `wallets.balance_cents` and `ledger` change together inside `apply_ledger_entry()`.
4. **Idempotency.** Every client mutation (`joinMatch`, `startStreak`, `submitScore`) sends a client-generated `idempotency_key`.
5. **Client is untrusted.** Unity and React Native never compute payouts or write the ledger.

Boundaries: [`docs/architecture/BOUNDARIES.md`](docs/architecture/BOUNDARIES.md).
Architecture diagram: [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md).
Build plan: [`docs/PLAN.md`](docs/PLAN.md).
Schema: [`docs/schema/SCHEMA.md`](docs/schema/SCHEMA.md) and [`backend/supabase/migrations/20260903120000_init.sql`](backend/supabase/migrations/20260903120000_init.sql).
API contracts: [`docs/api/CONTRACTS.md`](docs/api/CONTRACTS.md).
Backend spec: [`docs/backend/REQUIREMENTS.md`](docs/backend/REQUIREMENTS.md).
Locked decisions: [`DECISIONS.md`](DECISIONS.md).
Staff skills: [`docs/skills.md`](docs/skills.md).

## Toolchain

- Intended Node **22.18.0** (`.nvmrc`); Cloud Functions runtime is `nodejs22`. `save-exact=true` in `.npmrc`. Local Node 24 is allowed for `npm install`.
- Unity Hub → install editor **6000.1.13f1**, open `/unity`.
- Export iOS `UnityFramework` and Android `unityLibrary` into `mobile/unity/builds/` (not committed; regenerated from `/unity`).

Do not bump React Native, React, Unity, or `@azesmway/react-native-unity` independently. The first integration spike after scaffolding is a physical-device `UnityView` mount on iOS and Android.
