# project-x

Real-money asynchronous 1v1 skill game. Players stake integer cents on a ~60 second 2D basketball run. The React Native shell owns auth, wallet UI, and matchmaking calls. Unity owns the run. Firebase Functions + PostgreSQL own money.

Score verification and match settlement are in place, plus prize-boost promo accounting. Apply through `20260905120000_prize_boost_promo.sql`.

## Run from a clean checkout

### Platform

| | |
|---|---|
| Target | **Android** (physical phone or **arm64** emulator). Package id `com.rmgx.swap`. |
| Android API | minSdk **25** (Android 8.0), targetSdk **36** |
| ABI | `armeabi-v7a` + `arm64-v8a` only. x86_64 emulators crash (`libmain.so` missing). |
| Host | **Windows** is the documented path (PowerShell, `adb`, Gradle). |
| Also supported | Physical **iPhone** after a Unity iOS `UnityFramework` export. Not web. Not iOS Simulator. |

### Versions used

Same pins as the table below. For a checkout you need:

| Piece | Version |
|---|---|
| Node.js / npm | **22.18.0** / **10.9.3** (`.nvmrc`) |
| React Native / React | **0.86.0** / **19.2.3** |
| Unity Editor | **6000.3.18f1** |
| Firebase Functions | Node **22**, JavaScript, `firebase-tools` **15.29.0** |
| PostgreSQL | **17** (Supabase-hosted, direct port **5432**) |
| New Architecture | **On** (RN 0.86 cannot turn it off) |

### Secrets (not in git)

Copy these before `npm install` / first run:

1. `.firebaserc.example` → `.firebaserc` (Firebase project id, e.g. `rmg-x-b0e31`)
2. `backend/functions/.env.example` → `backend/functions/.env` with direct Postgres `PG_*`
3. `google-services.json` → `mobile/android/app/` (package `com.rmgx.swap`)
4. iOS only: `GoogleService-Info.plist` in `mobile/ios/`

Unity exports under `mobile/unity/builds/` are **not committed**. Re-export from `/unity` (see step 3).

### Steps

```powershell
# 1. Toolchain
nvm use            # Node 22.18.0
npm install

# 2. Database + Functions
npm run db:apply
npm run deploy:functions
# or, local only: npm run serve --workspace=functions

# 3. Unity (Editor 6000.3.18f1) — once per gameplay/Player Settings change
#    Hub → open unity/
#    Menu Project-X → Apply Embed Player Settings
#    Build Settings → enable Assets/_Main/Scenes/BasketBall.unity
#    Android → Export Project → mobile/unity/builds/android
#    Strip MAIN/LAUNCHER from the export unityLibrary AndroidManifest

# 4. Android debug (physical ARM / arm64 emulator; Metro in another terminal)
npm start --workspace=mobile
npm run android --workspace=mobile
```

Release / sideload (no Metro): `npm run android:apk --workspace=mobile`, then `adb install -r` the APK.

On device: sign in → join match → Unity visible → play → result. A second join must not black-screen.

### Test accounts

Firebase **Email/Password** on project `rmg-x-b0e31`. Use **Sign in** (or **Create account** if the user is not in Auth yet; password must be at least 6 characters).

| | Email | Password |
|---|---|---|
| Player A | `player1@project-x.app` | `Playtest1!` |
| Player B | `player2@project-x.app` | `Playtest2!` |

You need **two accounts** (two devices or two installs) for 1v1 — the server rejects self-match. First profile insert credits **$10.00** (`ADMIN_CREDIT`). Prize boosts are 1v1 only; Streak does not take a boost.

## Stack (pinned, no `^` / `~`)

| Piece | Pin |
|---|---|
| Node.js / npm | 22.18.0 / 10.9.3 |
| React Native | 0.86.0 |
| React | 19.2.3 (exact — renderer mismatch crash otherwise) |
| TypeScript (mobile + `packages/shared` only) | 5.9.3 |
| Firebase Functions | JavaScript (CommonJS) |
| `@azesmway/react-native-unity` | 1.1.1 |
| Unity Editor | 6000.3.18f1 |
| RNFirebase app / auth / functions / app-check | 26.3.3 |
| firebase-admin / firebase-functions | 14.3.0 / 7.3.2 |
| firebase-tools | 15.29.0 |
| PostgreSQL (Supabase-hosted) | 17 |
| `pg` (Functions) | 8.16.3 |
| C# (Unity default) | 9.0 |

Companion `@react-native/*` packages (babel-preset, metro-config, typescript-config, eslint-config, codegen, gradle-plugin) must also be **0.86.0**.

## Repository layout

```
project-x/
  mobile/                 React Native iOS + Android
    src/features/{auth,wallet,match,streak,inventory}
    src/bridge/           UnityView + message types only
    src/services/         Firebase + read-only Supabase clients (later)
    unity/builds/{ios,android}   azesmway export target
  unity/                  Unity 6 source (6000.3.18f1)
    Assets/Scripts/{Bridge,Gameplay,AntiCheat}
  backend/
    functions/            Firebase Functions (Node 22, JavaScript)
    supabase/migrations/  PostgreSQL source of truth
  packages/shared/        TS types for mobile; JSON contracts for Functions
  docs/
```

npm workspaces: `mobile`, `backend/functions`, `packages/shared`. Unity is not an npm workspace.

## Core rules

1. **Server authority.** Only Firebase Functions + Postgres may mutate wallets, resolve matches, or accept scores.
2. **Integer cents.** `$1.25 = 125`. No floating-point money. Multipliers use `Math.floor` before any ledger write; the house keeps the fraction.
3. **Atomic money.** `wallets.balance_cents` and `ledger` change together inside `apply_ledger_entry()`.
4. **Idempotency.** Every client mutation (`joinMatch`, `startStreak`, `submitScore`) sends a client-generated `idempotency_key`.
5. **Client is untrusted.** Unity and React Native never compute payouts or write the ledger.
6. **Game timing is server-authoritative.** The server provides absolute play-clock epochs (`gameStartEpochMs` / `gameEndEpochMs`); Unity derives the visible countdown with a server-time reference and monotonic elapsed time. The client timer is presentation state and is not trusted for score validation.

## Toolchain

- Intended Node **22.18.0** (`.nvmrc`); Cloud Functions runtime is `nodejs22`. `save-exact=true` in `.npmrc`. Local Node 24 is allowed for `npm install`.
- Unity Hub → install editor **6000.3.18f1**, open `/unity`.
- Export iOS `UnityFramework` and Android `unityLibrary` into `mobile/unity/builds/` (not committed; regenerated from `/unity`).
- New Architecture is **on**. RN 0.86 cannot disable it.

Do not bump React Native, React, Unity, or `@azesmway/react-native-unity` independently. Confirm the embed on a physical device: `UnityView` ping/pong on iOS and Android.
