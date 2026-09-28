const { HttpError } = require('../domain/httpError');

// Shared controller wrapper. A controller's job is HTTP shape only: run the
// service, translate the result into a status + JSON body, and translate
// failures.
//
//   const create = handleRequest(
//     { logLabel: 'Error saving repair request:', serverMessage: 'Internal Server Error', status: 201 },
//     async (req) => jobService.submitRequest(req)
//   );
//
// `run` returns `{ status?, body }` for success, or throws:
//   - HttpError            -> its exact status + body are sent
//   - anything else        -> logged with `logLabel`, then `serverMessage` @500
//
// Returning `{ body }` uses the wrapper's default `status` (200 unless set).
const handleRequest = ({ logLabel, serverMessage, status = 200 }, run) => async (req, res) => {
  try {
    const result = await run(req, res);
    if (result === undefined) return;
    res.status(result.status ?? status).json(result.body);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body);
    }
    console.error(logLabel, error);
    return res.status(500).json({ error: serverMessage });
  }
};

module.exports = { handleRequest };
