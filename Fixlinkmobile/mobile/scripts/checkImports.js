// Relative-import checker for the mobile app.
//
// `tsc --noEmit` is the primary safety net, but 11 files still carry
// `@ts-nocheck`, which suppresses *every* error in that file — including
// "cannot find module". Metro would only fail at bundle time, long after a
// refactor looked fine. This script walks src/ and verifies that every relative
// import/require actually resolves to a file on disk, regardless of @ts-nocheck.
//
// It also guards the EXPO_PUBLIC_* reads. Expo/Metro inlines a STATIC
// `process.env.EXPO_PUBLIC_X` at build time and cannot resolve a dynamic read
// such as `process.env[key]` — the dynamic form compiles, works in development
// and then silently returns the fallback in a production bundle. So a dynamic
// read is a hard failure here, and every statically read variable must be
// documented in .env.example (skipped when that file is absent).
//
// Run with: npm run check:imports

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// Extension-less imports resolve against this list, plus `/index.<ext>`.
const RESOLUTIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.json'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo']);

// Matches: from './x'  |  import('./x')  |  require('./x')
const RELATIVE_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]*)['"]/g;

const walk = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
};

const resolves = (basePath) => {
  for (const extension of RESOLUTIONS) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  for (const extension of RESOLUTIONS.slice(1)) {
    const candidate = path.join(basePath, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
};

const files = walk(SRC_DIR);
const broken = [];
let resolvedCount = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(RELATIVE_IMPORT)) {
    const specifier = match[1];
    const target = path.resolve(path.dirname(file), specifier);
    if (resolves(target)) {
      resolvedCount += 1;
    } else {
      const line = source.slice(0, match.index).split('\n').length;
      broken.push(`${path.relative(PROJECT_ROOT, file)}:${line}  ->  ${specifier}`);
    }
  }
}

// --- EXPO_PUBLIC_* static-access guard ------------------------------------
// `process.env.EXPO_PUBLIC_X` is fine; `process.env[X]` / `process.env?.[X]` is not.
//
// Comments are blanked out first (same length, so line numbers survive) — the
// rule is explained in prose in the files it protects, and that prose must not
// trip the check.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length));

const DYNAMIC_ENV_READ = /process\.env\s*\??\.?\s*\[/g;
const STATIC_ENV_READ = /process\.env\??\.(EXPO_PUBLIC_[A-Z0-9_]+)/g;
// An inline fallback such as `asBool(process.env.X, true)` puts a magic value
// back in the code; defaults must be named. `''` is allowed — it means "unset".
const LITERAL_ENV_FALLBACK =
  /process\.env\??\.(EXPO_PUBLIC_[A-Z0-9_]+)\s*(,|\?\?|\|\|)\s*('[^']*'|"[^"]*"|true|false|-?\d[\d.]*)/g;

const dynamicReads = [];
const literalFallbacks = [];
const staticVars = new Set();

for (const file of files) {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  for (const match of source.matchAll(DYNAMIC_ENV_READ)) {
    const line = source.slice(0, match.index).split('\n').length;
    dynamicReads.push(`${path.relative(PROJECT_ROOT, file)}:${line}`);
  }
  for (const match of source.matchAll(STATIC_ENV_READ)) staticVars.add(match[1]);
  for (const match of source.matchAll(LITERAL_ENV_FALLBACK)) {
    const [full, , , literal] = match;
    if (literal === "''" || literal === '""') continue;
    const line = source.slice(0, match.index).split('\n').length;
    literalFallbacks.push(`${path.relative(PROJECT_ROOT, file)}:${line}  ${full.trim()}`);
  }
}

if (dynamicReads.length > 0) {
  console.error(
    `Mobile check failed: ${dynamicReads.length} dynamic process.env read(s). `
    + 'Expo can only inline process.env.EXPO_PUBLIC_X (static member access):'
  );
  for (const entry of dynamicReads) console.error(`  ${entry}`);
  process.exit(1);
}

if (literalFallbacks.length > 0) {
  console.error(
    `Mobile check failed: ${literalFallbacks.length} inline literal fallback(s). `
    + 'Every default must be a named constant:'
  );
  for (const entry of literalFallbacks) console.error(`  ${entry}`);
  process.exit(1);
}

// --- .env.example coverage ------------------------------------------------
// Kept in sync so every knob the app reads is discoverable. The check is
// skipped when the template is absent, because .env.example is gitignored.
const EXAMPLE_PATH = path.join(PROJECT_ROOT, '.env.example');
let documented = null;
if (fs.existsSync(EXAMPLE_PATH)) {
  const example = fs.readFileSync(EXAMPLE_PATH, 'utf8');
  documented = new Set([...example.matchAll(/(EXPO_PUBLIC_[A-Z0-9_]+)/g)].map((match) => match[1]));
}

const undocumented = documented
  ? [...staticVars].filter((name) => !documented.has(name)).sort()
  : [];

if (undocumented.length > 0) {
  console.error(`Mobile check failed: ${undocumented.length} EXPO_PUBLIC_* read(s) missing from .env.example:`);
  for (const name of undocumented) console.error(`  ${name}`);
  process.exit(1);
}

if (broken.length > 0) {
  console.error(`Mobile check failed: ${broken.length} unresolved relative import(s):`);
  for (const entry of broken) console.error(`  ${entry}`);
  process.exit(1);
}

console.log(
  `Mobile check passed: ${files.length} file(s), ${resolvedCount} relative import(s) resolved, `
  + `${staticVars.size} EXPO_PUBLIC_* read(s) static, 0 dynamic, 0 literal fallback`
  + (documented ? `, ${documented.size} documented in .env.example.` : ' (.env.example not present, coverage skipped).')
);
