// One place that suspends an account (UAT #2 / #8 / #11).
//
// Suspension is a plain status write on `users`, and the login guard already
// refuses a suspended account for both roles — so every automatic trust rule
// funnels through here instead of repeating the write and its error handling.
//
// Nothing in this module throws. A failed suspension must never fail the action
// that triggered it (a filed report, a recorded no-show, an accepted
// cancellation); the log line is the signal that it needs a manual look.

const userRepository = require('../../repositories/userRepository');

// Returns true only when the account really is suspended now.
const suspendAccount = async (uid, { reason = 'automatic trust action' } = {}) => {
  if (!uid) return false;
  try {
    const { error } = await userRepository.updateStatus(uid, 'suspended');
    if (error) {
      console.warn(`Could not suspend account (${reason}):`, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`Could not suspend account (${reason}):`, error.message);
    return false;
  }
};

module.exports = { suspendAccount };
