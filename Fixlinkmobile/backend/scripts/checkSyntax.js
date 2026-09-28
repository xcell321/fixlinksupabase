#!/usr/bin/env node
// Fast, dependency-free health check for the backend sources.
//
//   node scripts/checkSyntax.js
//
// 1. Parses every .js file under src/ and test/ WITHOUT executing it, so a
//    syntax error introduced anywhere fails the check.
// 2. Verifies that every relative `require('./...')` / `require('../...')`
//    actually resolves to a file, which is what catches a stale import after
//    a module has been moved or renamed.
//
// It is intentionally not a test runner; `npm test` runs the real tests.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.join(__dirname, '..');
const scanRoots = ['src', 'test'].map((dir) => path.join(projectRoot, dir));

const REQUIRE_PATTERN = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

const failures = [];
let filesChecked = 0;
let requiresChecked = 0;

const listJsFiles = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
};

const resolves = (target) => {
  const candidates = [target, `${target}.js`, `${target}.json`, path.join(target, 'index.js')];
  return candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
};

const relative = (file) => path.relative(projectRoot, file).replace(/\\/g, '/');

for (const root of scanRoots) {
  if (!fs.existsSync(root)) continue;

  for (const file of listJsFiles(root)) {
    filesChecked += 1;
    const source = fs.readFileSync(file, 'utf8');

    try {
      new vm.Script(source, { filename: file });
    } catch (error) {
      failures.push(`${relative(file)}: ${error.message}`);
    }

    for (const match of source.matchAll(REQUIRE_PATTERN)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue; // node_modules / built-ins are fine
      requiresChecked += 1;
      const target = path.resolve(path.dirname(file), specifier);
      if (!resolves(target)) {
        failures.push(`${relative(file)}: cannot resolve require('${specifier}')`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`\nBackend check FAILED (${failures.length} problem(s)):\n`);
  failures.forEach((line) => console.error(`  - ${line}`));
  console.error('');
  process.exit(1);
}

console.log(
  `Backend check passed: ${filesChecked} file(s) parsed, ${requiresChecked} relative require(s) resolved.`
);
