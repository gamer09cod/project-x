# Version matrix (locked)

Approved 3 September 2026. All npm versions are exact — no `^` or `~`.

| Layer | Package / product | Version |
|---|---|---|
| Runtime | Node.js | 22.18.0 |
| Runtime | npm | 10.9.3 |
| Mobile | react-native | 0.86.0 |
| Mobile | react | 19.2.3 |
| Mobile | @types/react | 19.2.18 |
| Mobile | typescript | 5.9.3 |
| Bridge | @azesmway/react-native-unity | 1.1.1 |
| Game | Unity Editor | 6000.1.13f1 |
| Auth / client | @react-native-firebase/app | 26.3.3 |
| Auth / client | @react-native-firebase/auth | 26.3.3 |
| Auth / client | @react-native-firebase/functions | 26.3.3 |
| Auth / client | @react-native-firebase/app-check | 26.3.3 |
| Backend | firebase-admin | 14.3.0 |
| Backend | firebase-functions | 7.3.2 |
| Toolchain | firebase-tools | 15.29.0 |
| Data | @supabase/supabase-js | 2.114.0 |
| Data | PostgreSQL (Supabase) | 15 |
| Language (Unity) | C# | 9.0 |

Companion `@react-native/*` packages (codegen, gradle-plugin, metro-config, typescript-config, babel-preset, eslint-config) must also be **0.86.0**. Do not mix 0.86.3 artifacts.

React **must** be exactly `19.2.3`. A later 19.2.x satisfies the published peer range and then crashes against the embedded renderer.
