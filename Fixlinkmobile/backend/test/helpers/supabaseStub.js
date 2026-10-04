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
    rows.filter((row) => {
      const base =
        Object.entries(state.filters).every(([column, value]) => String(row[column]) === String(value)) &&
        Object.entries(state.gtFilters || {}).every(([column, value]) => String(row[column]) > String(value)) &&
        Object.entries(state.inFilters || {}).every(([column, values]) =>
          (values || []).map(String).includes(String(row[column]))) &&
        Object.entries(state.ilikeFilters || {}).every(([column, value]) =>
          String(row[column] ?? '').toLowerCase().includes(String(value || '').replace(/%/g, '').toLowerCase()));
      if (!base) return false;
      const orGroups = state.orFilters || [];
      if (orGroups.length === 0) return true;
      return orGroups.some((group) =>
        group.every(([column, value]) => String(row[column]) === String(value)));
    });

  const settle = () => {
    if (state.head) {
      return { data: [], error: null, count: matches().length };
    }
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
    select(...args) {
      if (state.op !== 'update' && state.op !== 'insert') state.op = 'select';
      if (args[1] && args[1].head === true) state.head = true;
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
    // Minimal `.or()` for queries shaped like
    // `id.eq.X,original_request_id.eq.Y` (comma = OR of AND-groups).
    // Case-insensitive substring match, mirroring Supabase `.ilike()`.
    ilike(column, value) {
      state.ilikeFilters = state.ilikeFilters || {};
      state.ilikeFilters[column] = value;
      return builder;
    },
    or(expression) {
      const groups = String(expression || '')
        .split(',')
        .map((part) => {
          const match = part.trim().match(/^([^.]+)\.eq\.(.*)$/);
          return match ? [[match[1], match[2]]] : null;
        })
        .filter(Boolean);
      state.orFilters = (state.orFilters || []).concat(groups);
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
    // Minimal RPC surface the guarded routes exercise. Kept small and explicit
    // so a test failure points at the exact behavior that changed.
    rpc(name, params = {}) {
      if (name === 'accept_job') {
        const job = (tables.jobs || []).find((j) => String(j.id) === String(params.p_job_id));
        if (!job) return Promise.resolve({ data: null, error: { message: 'Repair request not found' } });
        if (String(job.status).toLowerCase() !== 'pending') {
          return Promise.resolve({ data: null, error: { message: 'This job is no longer pending' } });
        }
        job.status = 'Accepted';
        job.technician_uid = params.p_technician_uid;
        job.technician_name = params.p_technician_name;
        return Promise.resolve({ data: job.id, error: null });
      }
      if (name === 'record_no_show') {
        const customer = (tables.users || []).find((u) => String(u.id) === String(params.p_customer_uid));
        const count = (Number(customer?.no_show_count) || 0) + 1;
        if (customer) customer.no_show_count = count;
        const incidents = tables.service_incidents || (tables.service_incidents = []);
        incidents.push({
          id: `incident-${incidents.length + 1}`,
          type: 'no_show',
          stage: params.p_stage,
          customer_uid: params.p_customer_uid,
          technician_uid: params.p_technician_uid,
          reason: params.p_reason,
          status: 'logged',
        });
        return Promise.resolve({ data: count, error: null });
      }
      if (name === 'record_scam_incident') {
        const reported = (tables.users || []).find((u) => String(u.id) === String(params.p_reported_uid));
        const count = (Number(reported?.scam_count) || 0) + 1;
        if (reported) reported.scam_count = count;
        const incidents = tables.service_incidents || (tables.service_incidents = []);
        incidents.push({ id: `incident-${incidents.length + 1}`, type: 'scam', ...params, created_at: new Date().toISOString() });
        return Promise.resolve({ data: count, error: null });
      }
      // Rating roll-ups have no stub-side effect the tests depend on.
      return Promise.resolve({ data: null, error: null });
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
