// Typed error that carries the HTTP status and exact JSON body out of a
// service. Without it, every service would need to know about `res`.
//
//   throw new HttpError(403, { error: 'Not authorized.' })
//
// Anything that is NOT an HttpError is treated by controllers/handleRequest.js
// as an unexpected 500, which keeps the original per-endpoint log + fallback
// message behaviour intact.
class HttpError extends Error {
  constructor(status, body) {
    const payload = typeof body === 'string' ? { error: body } : body;
    super(payload?.error || payload?.message || 'Request failed');
    this.name = 'HttpError';
    this.status = status;
    this.body = payload || {};
  }
}

module.exports = { HttpError };
