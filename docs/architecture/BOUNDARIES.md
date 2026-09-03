# Architectural boundaries

| From | May | Must not |
|---|---|---|
| Unity | Emit a `scorePayload` over the RN bridge | Touch wallets, HTTP, Firebase, or Supabase |
| React Native | Host `UnityView`, generate `idempotency_key`, call HTTPS callables, render balances | Compute payouts, write ledger rows, or treat a local score as final |
| Firebase Functions | Verify ID token + App Check, run Postgres transactions, settle matches | Accept floating-point money or skip `idempotency_key` |
| Supabase (device) | None in v1 (RLS deny-all) | Hold the service role key, or `UPDATE` wallets / `INSERT` ledger |

Money writes go exclusively through `apply_ledger_entry` in PostgreSQL. Wallet `UPDATE`s from any other call path are rejected by trigger.

Unity source lives in `/unity`. Exported `UnityFramework` / `unityLibrary` artifacts land in `/mobile/unity/builds/`, which is the path `@azesmway/react-native-unity` requires.
