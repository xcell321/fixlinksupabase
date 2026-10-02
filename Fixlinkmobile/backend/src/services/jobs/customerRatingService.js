// Customer-rating service: POST /api/requests/:id/rate-customer.
//
// UAT #11 — the technician rates the customer after a completed job. This is
// the mirror of reviewService (customer rates technician) and lives in the same
// `reviews` table, distinguished by `reviewer_role = 'technician'`.
//
// UAT #11 also carries a reputation rule: when a customer accumulates
// CUSTOMER_NEGATIVE_RATING_LIMIT negative ratings (at or below
// NEGATIVE_RATING_MAX, default 3 ratings of <= 2 stars), the customer is
// auto-suspended. The whole rule is env-toggleable.

const jobRepository = require('../../repositories/jobRepository');
const reviewRepository = require('../../repositories/reviewRepository');
const userRepository = require('../../repositories/userRepository');
const { HttpError } = require('../../domain/httpError');
const {
  isValidRating,
  ratingRangeLabel,
  isNegativeRating,
  shouldSuspendForNegativeRatings,
  negativeRatingLimit,
} = require('../../domain/ratingRules');

const isMissingColumn = (error) =>
  /reviewer_role|could not find.*column|PGRST204/i.test(String(error?.message || ''));

// POST /api/requests/:id/rate-customer
const rateCustomer = async ({ jobId, authUid, technicianUid, rating, comment }) => {
  if (!technicianUid || !isValidRating(rating)) {
    throw new HttpError(400, {
      error: `Technician identity and a rating from ${ratingRangeLabel()} are required.`,
    });
  }
  if (String(technicianUid) !== String(authUid)) {
    throw new HttpError(403, { error: 'You can only rate customers of your own jobs.' });
  }

  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job
    || String(job.technician_uid) !== String(technicianUid)
    || String(job.status).toLowerCase() !== 'completed') {
    throw new HttpError(404, { error: 'Completed job not found.' });
  }

  const existing = await reviewRepository.findByRequestAndReviewerRole(job.id, 'technician');
  if (existing) {
    throw new HttpError(409, { error: 'This customer has already been rated for this job.' });
  }

  const row = {
    technician_uid: job.technician_uid,
    technician_name: job.technician_name,
    customer_uid: job.customer_uid,
    customer_name: job.customer_name,
    rating: Number(rating),
    comment: String(comment || '').trim(),
    request_id: job.id,
    reviewer_role: 'technician',
    created_at: new Date().toISOString(),
  };

  let { error: saveError } = await reviewRepository.insertReview(row);
  // A database that has not run the reviewer_role migration must still accept
  // the rating, exactly like the customer-to-technician direction.
  if (saveError && isMissingColumn(saveError)) {
    const { reviewer_role: _ignored, ...legacy } = row;
    ({ error: saveError } = await reviewRepository.insertReview(legacy));
  }
  if (saveError) {
    throw new HttpError(500, { error: 'Unable to submit customer rating.' });
  }

  if (job.customer_uid) {
    try {
      await reviewRepository.recomputeCustomerRating(job.customer_uid);
    } catch (ratingError) {
      console.warn('Could not sync customer rating:', ratingError.message);
    }
  }

  // UAT #11: enough negative ratings suspend the customer.
  let customerSuspended = false;
  if (job.customer_uid && isNegativeRating(rating)) {
    try {
      const history = await reviewRepository.findTechnicianReviewsForCustomer(job.customer_uid);
      const negatives = history.filter((row) => isNegativeRating(row.rating)).length;
      if (shouldSuspendForNegativeRatings(negatives)) {
        const { error: suspendError } = await userRepository.updateStatus(job.customer_uid, 'suspended');
        if (!suspendError) customerSuspended = true;
      }
    } catch (suspendError) {
      console.warn('Could not apply the negative-rating policy:', suspendError.message);
    }
  }

  return {
    status: 201,
    body: {
      message: customerSuspended
        ? `Customer rated. The account was suspended after reaching ${negativeRatingLimit()} negative ratings.`
        : 'Customer rated successfully.',
      customerSuspended,
    },
  };
};

module.exports = { rateCustomer };
