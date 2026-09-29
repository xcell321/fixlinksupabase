// Shared id-shape guards. Ids passed straight to SQL RPCs must be validated
// before the call: a malformed value surfaces as a Postgres syntax error and
// would otherwise become a 500 instead of a 400.
const { HttpError } = require('./httpError');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_RE.test(String(value ?? ''));

const assertUuid = (value, label = 'id') => {
  if (!isUuid(value)) {
    throw new HttpError(400, { error: `Invalid ${label}.` });
  }
};

module.exports = { isUuid, assertUuid };
