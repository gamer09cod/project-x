# Architectural boundaries

| From | May | Must not |
|---|---|---|
| Unity | Emit a `scorePayload` over the RN bridge | Touch wallets, HTTP, Firebase, or Supabase |
| React Native | Host `UnityView`, generate `idempotency_key`, call HTTPS callables, render balances | Compute payouts, write ledger rows, or treat a local score as final |
| Firebase Functions | Verify ID token + App Check; parameterised `pg` SQL; settle matches | Accept floating-point money, skip `idempotency_key`, use an ORM or `@supabase/supabase-js` |
| Mobile → Postgres | None | Hold `DATABASE_URL`, or `UPDATE` wallets / `INSERT` ledger |

Money writes go exclusively through `apply_ledger_entry` in PostgreSQL. Wallet `UPDATE`s from any other call path are rejected by trigger.

Unity source lives in `/unity`. Exported `UnityFramework` / `unityLibrary` artifacts land in `/mobile/unity/builds/`, which is the path `@azesmway/react-native-unity` requires.
