// Review service: POST /api/requests/:id/review.
// Extracted verbatim from services/jobService.js. Behavior is unchanged.

const jobRepository = require('../../repositories/jobRepository');
const reviewRepository = require('../../repositories/reviewRepository');
const { HttpError } = require('../../domain/httpError');

// POST /api/requests/:id/review
const submitReview = async ({ jobId, authUid, customerName, rating, comment }) => {
  const numericRating = Number(rating);
  if (!customerName || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new HttpError(400, { error: 'Customer name and a rating from 1 to 5 are required.' });
  }

  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job
    || job.customer_uid !== authUid
    || job.customer_name !== customerName
    || String(job.status).toLowerCase() !== 'completed') {
    throw new HttpError(404, { error: 'Completed job not found.' });
  }
  if (job.review_id) throw new HttpError(409, { error: 'This job has already been reviewed.' });

  const { data: review, error: reviewError } = await reviewRepository.insertReview({
    technician_uid: job.technician_uid,
    technician_name: job.technician_name,
    customer_name: customerName,
    rating: numericRating,
    comment: String(comment || '').trim(),
    request_id: job.id,
    created_at: new Date().toISOString(),
  });
  if (reviewError) throw reviewError;

  await jobRepository.updateById(job.id, { review_id: review.id, reviewed_at: new Date().toISOString() });

  if (job.technician_uid) {
    try {
      await reviewRepository.recomputeTechnicianRating(job.technician_uid);
    } catch (ratingError) {
      console.warn('Could not sync user rating:', ratingError.message);
    }
  }

  return { status: 201, body: { message: 'Review submitted successfully.' } };
};

module.exports = { submitReview };
