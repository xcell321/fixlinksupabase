// Single rating aggregation used by the customer job list, the public
// technician profile and the AI assistant top-technician query.
// Previously copied 3x with the same reduce/toFixed(1) fallback shape.

function summarizeRatings(reviews, fallback = {}) {
  const list = Array.isArray(reviews) ? reviews : [];
  if (list.length > 0) {
    return {
      rating: Number(
        (list.reduce((sum, review) => sum + Number(review.rating || 0), 0) / list.length).toFixed(1)
      ),
      totalReviews: list.length,
    };
  }
  const fallbackRating = Number(fallback.rating);
  if (Number.isFinite(fallbackRating) && fallbackRating > 0) {
    return {
      rating: Number(fallbackRating.toFixed(1)),
      totalReviews: Number(fallback.totalReviews || 1),
    };
  }
  return { rating: null, totalReviews: Number(fallback.totalReviews || 0) };
}

module.exports = { summarizeRatings };
