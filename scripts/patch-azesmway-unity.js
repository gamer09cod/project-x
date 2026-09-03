/**
 * @azesmway/react-native-unity@1.1.1 still lists jcenter(), which modern
 * Gradle removed. Strip it after npm install / before Android builds.
 */
const fs = require('fs');
const path = require('path');

const target = path.resolve(
  __dirname,
  '../node_modules/@azesmway/react-native-unity/android/build.gradle',
);

if (!fs.existsSync(target)) {
  console.warn('[patch-azesmway] package not installed yet:', target);
  process.exit(0);
}

const before = fs.readFileSync(target, 'utf8');
const after = before.replace(/^[ \t]*jcenter\(\)\r?\n/gm, '');

if (after === before) {
  console.log('[patch-azesmway] already clean (no jcenter())');
  process.exit(0);
}

fs.writeFileSync(target, after);
console.log('[patch-azesmway] removed jcenter() from', path.relative(process.cwd(), target));
