// Shared async helpers for backend routes and services.
// Extracted from routes/auth.js so registration, uploads and password reset
// share one timeout implementation instead of three local copies.

// Bounds any promise that has no built-in timeout (Supabase storage writes can
// hang on slow networks). The caller always resolves because the request can
// never hang forever.
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
