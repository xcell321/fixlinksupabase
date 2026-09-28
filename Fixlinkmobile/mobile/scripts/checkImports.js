// Relative-import checker for the mobile app.
//
// `tsc --noEmit` is the primary safety net, but 11 files still carry
// `@ts-nocheck`, which suppresses *every* error in that file — including
// "cannot find module". Metro would only fail at bundle time, long after a
// refactor looked fine. This script walks src/ and verifies that every relative
// import/require actually resolves to a file on disk, regardless of @ts-nocheck.
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

if (broken.length > 0) {
  console.error(`Mobile check failed: ${broken.length} unresolved relative import(s):`);
  for (const entry of broken) console.error(`  ${entry}`);
  process.exit(1);
}

console.log(
  `Mobile check passed: ${files.length} file(s), ${resolvedCount} relative import(s) resolved.`
);
