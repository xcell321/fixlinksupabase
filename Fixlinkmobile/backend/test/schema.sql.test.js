// Static validation of src/db/schema.sql.
//
// The schema is meant to be re-runnable: it must build correctly on a fresh
// database AND be safe to paste into an existing one. That gives two classes of
// bug that only surface at runtime, so they are checked here instead:
//
//   ordering    - a statement that targets a table before it is created
//                 (e.g. `alter table ... enable row level security`, or an FK
//                 `references public.other`). This is the password_resets bug.
//   idempotency - a statement that errors when run twice because it is missing
//                 `if not exists` / `or replace`, or adds a constraint without
//                 dropping it first.
//
// Pure file parsing: no database, no network, no env.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_PATH = path.join(__dirname, '..', 'src', 'db', 'schema.sql');

// Strip comments so a word inside a comment can never be mistaken for SQL.
const readCodeLines = () => fs.readFileSync(SCHEMA_PATH, 'utf8')
  .split(/\r?\n/)
  .map((line, index) => ({ number: index + 1, text: line.replace(/--.*$/, '').trim() }))
  .filter((entry) => entry.text.length > 0);

const lines = readCodeLines();
const firstMatch = (regex) => lines.find((entry) => regex.test(entry.text));

// Line number of `create table ... public.<name>`, or undefined.
const createLineOf = (name) => {
  const entry = lines.find((candidate) => new RegExp(`create table(?: if not exists)? public\\.${name}\\b`, 'i').test(candidate.text));
  return entry ? entry.number : undefined;
};

test('every created table has row level security enabled after creation', () => {
  const created = lines
    .map((entry) => entry.text.match(/create table(?: if not exists)? public\.([a-z_]+)/i))
    .filter(Boolean)
    .map((match) => match[1]);

  assert.ok(created.length > 0, 'expected the schema to create at least one table');

  const problems = [];
  for (const name of created) {
    const enable = lines.find((entry) => new RegExp(`alter table public\\.${name} enable row level security`, 'i').test(entry.text));
    if (!enable) { problems.push(`${name}: no "enable row level security"`); continue; }
    if (enable.number < createLineOf(name)) problems.push(`${name}: RLS enabled at line ${enable.number} before create at line ${createLineOf(name)}`);
  }
  assert.deepEqual(problems, [], `RLS ordering problems:\n${problems.join('\n')}`);
});

test('no orphaned row-level-security statement targets a table that is never created', () => {
  const problems = [];
  for (const entry of lines) {
    const match = entry.text.match(/alter table public\.([a-z_]+) enable row level security/i);
    if (!match) continue;
    if (createLineOf(match[1]) === undefined) problems.push(`line ${entry.number}: ${match[1]} is never created`);
  }
  assert.deepEqual(problems, [], `orphaned RLS statements:\n${problems.join('\n')}`);
});

test('foreign keys only reference tables created earlier in the file', () => {
  const problems = [];
  for (const entry of lines) {
    const match = entry.text.match(/references public\.([a-z_]+)/i);
    if (!match) continue;
    const target = createLineOf(match[1]);
    if (target === undefined) problems.push(`line ${entry.number}: references ${match[1]} which is never created`);
    else if (target > entry.number) problems.push(`line ${entry.number}: references ${match[1]} created later at line ${target}`);
  }
  assert.deepEqual(problems, [], `foreign-key ordering problems:\n${problems.join('\n')}`);
});

test('create table always uses if not exists', () => {
  const problems = lines
    .filter((entry) => /\bcreate table\b/i.test(entry.text) && !/create table if not exists/i.test(entry.text))
    .map((entry) => `line ${entry.number}: ${entry.text}`);
  assert.deepEqual(problems, [], `non-idempotent create table:\n${problems.join('\n')}`);
});

test('create index always uses if not exists', () => {
  const problems = lines
    .filter((entry) => /\bcreate index\b/i.test(entry.text) && !/create index if not exists/i.test(entry.text))
    .map((entry) => `line ${entry.number}: ${entry.text}`);
  assert.deepEqual(problems, [], `non-idempotent create index:\n${problems.join('\n')}`);
});

test('alter table ... add column always uses if not exists', () => {
  const problems = lines
    .filter((entry) => /\balter table\b/i.test(entry.text) && /\badd column\b/i.test(entry.text))
    .filter((entry) => !/add column if not exists/i.test(entry.text))
    .map((entry) => `line ${entry.number}: ${entry.text}`);
  assert.deepEqual(problems, [], `non-idempotent add column:\n${problems.join('\n')}`);
});

test('every add constraint is preceded by a matching drop constraint if exists', () => {
  const problems = [];
  for (const entry of lines) {
    const match = entry.text.match(/add constraint ([a-z0-9_]+)/i);
    if (!match) continue;
    const name = match[1];
    const drop = lines.find((candidate) => candidate.number < entry.number
      && new RegExp(`drop constraint if exists ${name}\\b`, 'i').test(candidate.text));
    if (!drop) problems.push(`line ${entry.number}: "add constraint ${name}" has no earlier "drop constraint if exists ${name}"`);
  }
  assert.deepEqual(problems, [], `non-idempotent constraints:\n${problems.join('\n')}`);
});

test('create function always uses or replace', () => {
  const problems = lines
    .filter((entry) => /^create function\b/i.test(entry.text))
    .map((entry) => `line ${entry.number}: ${entry.text}`);
  assert.deepEqual(problems, [], `non-idempotent function definitions:\n${problems.join('\n')}`);
});

test('row level security is enabled on every table the backend relies on', () => {
  // Guards against a new table being added without its RLS statement.
  const created = new Set(lines
    .map((entry) => entry.text.match(/create table(?: if not exists)? public\.([a-z_]+)/i))
    .filter(Boolean)
    .map((match) => match[1]));
  const secured = new Set(lines
    .map((entry) => entry.text.match(/alter table public\.([a-z_]+) enable row level security/i))
    .filter(Boolean)
    .map((match) => match[1]));
  const unsecured = [...created].filter((name) => !secured.has(name));
  assert.deepEqual(unsecured, [], `tables without RLS: ${unsecured.join(', ')}`);
});

test('the UAT migrations are all present', () => {
  const required = [
    'reviewer_role',
    'scam_count',
    'photo_risk_score',
    'safety_flags',
    'safety_level',
    'terms_accepted_at',
    'terms_version',
    'credential_risk_score',
    'credential_risk_level',
    'selfie_url',
    'face_check_level',
    'recompute_customer_rating',
    'record_scam_incident',
  ];
  const missing = required.filter((needle) => !firstMatch(new RegExp(needle, 'i')));
  assert.deepEqual(missing, [], `missing from schema.sql: ${missing.join(', ')}`);
});
