// In-memory stand-in for src/config/supabase used by the security tests.
//
// The real config verifies Supabase JWTs against a remote JWKS endpoint and
// talks to the live database. Neither is available in a unit test run, so this
// helper swaps the config module for a deterministic fake BEFORE the app is
// required. That lets the tests drive the actual Express request path (auth
// guard -> role/ownership guard -> handler) instead of asserting on internals.
//
// It must be installed before the app entry module (../src/index) is loaded,
// because modules such as middleware/requireAuth.js destructure these exports
// at load time.

const configPath = require.resolve('../../src/config/supabase');

const cloneRow = (row) => (row ? { ...row } : null);

// Minimal chainable query builder covering the calls the guarded routes make:
//   select(...).order(...)                       -> resolves a row array
//   select(...).eq(...).maybeSingle()/.single()  -> resolves a single row
//   update(...).eq(...)                          -> applies and resolves
function createQueryBuilder(table, state, rows) {
  const matches = () =>
    rows.filter(
      (row) =>
        Object.entries(state.filters).every(([column, value]) => String(row[column]) === String(value)) &&
        Object.entries(state.gtFilters || {}).every(([column, value]) => String(row[column]) > String(value)) &&
        Object.entries(state.inFilters || {}).every(([column, values]) =>
          (values || []).map(String).includes(String(row[column])))
    );

  const settle = () => {
    if (state.op === 'update') {
      for (const row of matches()) Object.assign(row, state.payload);
      return { data: null, error: null };
    }
    if (state.op === 'insert') {
      rows.push({ ...state.payload });
      return { data: null, error: null };
    }
    return { data: matches().map(cloneRow), error: null };
  };

  // Supabase returns the affected row when `.select()` follows an update or
  // insert, so mirror that: apply the write, then resolve like a single read.
  const afterWriteOrRead = () => {
    if (state.op === 'insert') {
      settle();
      return { data: cloneRow(state.payload) || null, error: null };
    }
    if (state.op === 'update') {
      const targets = matches();
      settle();
      return { data: targets[0] ? cloneRow(targets[0]) : null, error: null };
    }
    return { data: cloneRow(matches()[0]) || null, error: null };
  };

  const builder = {
    select() {
      if (state.op !== 'update' && state.op !== 'insert') state.op = 'select';
      return builder;
    },
    update(payload) {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    insert(payload) {
      state.op = 'insert';
      state.payload = payload;
      return builder;
    },
    eq(column, value) {
      state.filters[column] = value;
      return builder;
    },
    is(column, value) {
      state.filters[column] = value;
      return builder;
    },
    gt(column, value) {
      state.gtFilters[column] = value;
      return builder;
    },
    in(column, values) {
      state.inFilters[column] = values;
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(afterWriteOrRead());
    },
    single() {
      return Promise.resolve(afterWriteOrRead());
    },
    then(resolve, reject) {
      return Promise.resolve(settle()).then(resolve, reject);
    },
  };

  return builder;
}

// tokens maps an opaque bearer string to the uid it authenticates, so tests can
// act as an admin, a customer, or a specific technician.
function installSupabaseStub({ users = [], tokens = {}, tables: extraTables = {} } = {}) {
  const tables = { users: users.map((user) => ({ ...user })) };
  for (const [table, rows] of Object.entries(extraTables)) {
    tables[table] = (rows || []).map((row) => ({ ...row }));
  }

  const supabase = {
    from(table) {
      if (!tables[table]) tables[table] = [];
      return createQueryBuilder(table, { table, filters: {}, gtFilters: {}, inFilters: {}, op: 'select', payload: null }, tables[table]);
    },
    storage: {
      from() {
        return { upload: async () => ({ data: null, error: null }) };
      },
    },
  };

  const verifyAccessToken = async (token) => {
    const subject = tokens[token];
    if (!subject) throw new Error('Invalid or expired authentication token.');
    return { sub: subject, email: `${subject}@fixlink.test` };
  };

  const stubExports = {
    supabase,
    supabaseAuth: { auth: {} },
    verifyAccessToken,
    publicStorageUrl: (bucket, path) => (path ? `https://stub.local/${bucket}/${path}` : null),
    storageUrl: (key) => (key ? `https://stub.local/${key}` : null),
    uploadBuffer: async () => 'https://stub.local/upload',
    STORAGE_BUCKET: 'fixlink',
  };

  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: stubExports,
    children: [],
    paths: [],
  };

  return { tables, verifyAccessToken };
}

module.exports = { installSupabaseStub };
