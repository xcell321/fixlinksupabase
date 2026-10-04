// Job submission service: POST /api/requests.
// Extracted verbatim from services/jobService.js so the submit path lives in
// one focused module. Behavior is unchanged.

const { uploadBuffer } = require('../../config/supabase');
const jobRepository = require('../../repositories/jobRepository');
const { buildSubmitFingerprint, submitDedupe } = require('../../domain/submitDedupe');
const { maxDailyRequests, overDailyLimit } = require('../../domain/dailyRequestLimit');
const { termsVersion, verifyTerms } = require('../../domain/submitTerms');
const { HttpError } = require('../../domain/httpError');
const { resolveJobCoordinates } = require('../locationService');
const { analyzeRepairDescription, isAiConfigured } = require('../repairAnalyzer');
const { screenRepairPhoto } = require('../credential/photoScreeningService');
const { assessRequest, isInvalidAddress } = require('./requestSafetyService');

// POST /api/requests — submit a new repair request (customer side).
const submitRequest = async ({ authUid, body, file }) => {
  const {
    customerName,
    customerUid,
    applianceType,
    category,
    description,
    location,
    latitude,
    longitude,
    preferredDate,
    preferredTime,
    scheduledDate,
    isOther,
  } = body;

  if (customerUid && customerUid !== authUid) {
    throw new HttpError(403, { error: 'You can only submit requests for your own account.' });
  }
  if (!customerName || !applianceType || !description || !location) {
    throw new HttpError(400, { error: 'Please fill out all required fields.' });
  }

  // UAT #4: the booking regulations (1-day rule, 5-hour rule, same-day charge)
  // must be accepted. The app gates step 3 -> step 4 with a modal, and this is
  // the same rule enforced for any client that reaches the endpoint directly.
  const termsVerdict = verifyTerms(body);
  if (!termsVerdict.ok) {
    throw new HttpError(400, { error: termsVerdict.reason });
  }

  // UAT #6: at most `maxDailyRequests()` requests per user per calendar day.
  if (customerUid) {
    const todaysJobs = await jobRepository.findByCustomerUid(customerUid);
    if (overDailyLimit(todaysJobs || [])) {
      throw new HttpError(429, {
        error: `Daily limit reached: at most ${maxDailyRequests()} requests per day.`,
      });
    }
  }

  // Duplicate-submit guard: a double tap or a retried request must not create
  // two jobs.
  const fingerprint = buildSubmitFingerprint({ customerUid, applianceType, description });
  if (submitDedupe.isDuplicate(fingerprint)) {
    throw new HttpError(429, {
      error: 'It looks like you already submitted this. Please wait a moment before trying again.',
    });
  }
  submitDedupe.remember(fingerprint);

  let finalLat = Number(latitude);
  let finalLon = Number(longitude);
  if (!Number.isFinite(finalLat) || !Number.isFinite(finalLon)) {
    const resolved = await resolveJobCoordinates(latitude, longitude, location);
    if (resolved) {
      finalLat = resolved.latitude;
      finalLon = resolved.longitude;
    }
  }

  // UAT #5: fake-address / grudge-booking / spam-booking protection.
  let safetyVerdict = { blocked: false, flags: [], level: 'low' };
  try {
    safetyVerdict = await assessRequest({
      customerUid,
      address: location,
      description,
      applianceType,
      serviceLatitude: finalLat,
      serviceLongitude: finalLon,
    });
  } catch (safetyError) {
    console.warn('Request safety check skipped:', safetyError.message);
  }
  if (safetyVerdict.blocked) {
    throw new HttpError(isInvalidAddress(safetyVerdict) ? 400 : 429, { error: safetyVerdict.reason });
  }

  let resolvedDate = preferredDate ? String(preferredDate).trim() : null;
  let resolvedTime = preferredTime ? String(preferredTime).trim() : null;
  const resolvedScheduled = scheduledDate ? String(scheduledDate).trim() : null;

  // A scheduled timestamp is the single source of truth; derive the display
  // date/time from it when the app only sent the machine value.
  if ((!resolvedDate || !resolvedTime) && resolvedScheduled) {
    try {
      const scheduled = new Date(resolvedScheduled);
      if (!isNaN(scheduled.getTime())) {
        if (!resolvedDate) {
          resolvedDate = scheduled.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        if (!resolvedTime) {
          resolvedTime = scheduled.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
      }
    } catch (_) {}
  }

  const newRequest = {
    customerName,
    ...(customerUid && { customerUid }),
    applianceType,
    ...(category && String(category).trim() && { category: String(category).trim() }),
    description,
    location,
    ...(Number.isFinite(finalLat) && { latitude: finalLat }),
    ...(Number.isFinite(finalLon) && { longitude: finalLon }),
    ...(resolvedDate && { preferredDate: resolvedDate }),
    ...(resolvedTime && { preferredTime: resolvedTime }),
    ...(resolvedScheduled && { scheduledDate: resolvedScheduled }),
    status: 'Pending',
    createdAt: new Date().toISOString(),
    isOther: Boolean(isOther),
  };

  let photoUrl = null;
  if (file) {
    try {
      photoUrl = await uploadBuffer({
        folder: 'repair-photos',
        file,
        buffer: file.buffer,
        contentType: file.mimetype,
      });
    } catch (photoError) {
      console.error('Photo upload failed; saving request without photo:', photoError.message);
    }
  }

  // UAT #6: screen the device photo so the technician is warned if it looks
  // fake (AI-generated, edited, screenshot). Advisory only, never blocks.
  let photoScreening = null;
  if (file) {
    try {
      photoScreening = await screenRepairPhoto(file);
    } catch (screeningError) {
      console.warn('Repair photo screening skipped:', screeningError.message);
    }
  }

  // The confirmed service location is snapshotted at submit time and kept
  // separate from the customer's live GPS. The technician always travels to
  // this location even if the customer is physically somewhere else.
  const nowIso = new Date().toISOString();
  const jobRow = {
    customer_name: customerName,
    ...(customerUid && { customer_uid: customerUid }),
    appliance_type: applianceType,
    ...(category && String(category).trim() && { category: String(category).trim() }),
    description,
    location,
    ...(Number.isFinite(finalLat) && { latitude: finalLat }),
    ...(Number.isFinite(finalLon) && { longitude: finalLon }),
    ...(Number.isFinite(finalLat) && { service_latitude: finalLat }),
    ...(Number.isFinite(finalLon) && { service_longitude: finalLon }),
    confirmed_service_location: location,
    ...(resolvedDate && { preferred_date: resolvedDate }),
    ...(resolvedTime && { preferred_time: resolvedTime }),
    ...(resolvedScheduled && { scheduled_date: resolvedScheduled }),
    status: 'Pending',
    is_other: Boolean(isOther),
    ...(photoUrl && { photo_url: photoUrl }),
    ...(photoScreening && {
      photo_risk_score: photoScreening.riskScore,
      photo_risk_level: photoScreening.riskLevel,
      photo_flags: photoScreening.flags,
      photo_notes: photoScreening.notes,
    }),
    ...(safetyVerdict.flags.length > 0 && {
      safety_flags: safetyVerdict.flags,
      safety_level: safetyVerdict.level,
    }),
    // UAT #4: audit trail for the accepted regulations.
    ...(termsVerdict.ok && { terms_accepted_at: nowIso, terms_version: termsVersion() }),
    created_at: nowIso,
  };

  let { id: requestId, error: insertError } = await jobRepository.insertJob(jobRow);
  // Tolerate a database that has not run the newest migration yet: the terms
  // columns are the most recent on `jobs`, so drop them and retry rather than
  // losing the booking.
  if (insertError && /terms_accepted_at|terms_version/.test(String(insertError.message || ''))) {
    console.warn('Skipping missing terms columns on jobs during submit (run the schema migration).');
    delete jobRow.terms_accepted_at;
    delete jobRow.terms_version;
    ({ id: requestId, error: insertError } = await jobRepository.insertJob(jobRow));
  }

  if (insertError) {
    console.error('Error saving repair request:', insertError);
    throw new HttpError(500, { error: 'Internal Server Error' });
  }

  // Best-effort AI auto-fill: when no category was picked (e.g. "other"), let
  // the AI triage the description into a category so technician matching keeps
  // working. Never blocks the response — a failure leaves the job as-is.
  const resolvedCategory = String(category || '').trim();
  if (!resolvedCategory && isAiConfigured()) {
    analyzeRepairDescription({ description, applianceType, category })
      .then((analysis) => {
        const detectedCategory = analysis?.category;
        if (!detectedCategory) return null;
        return jobRepository.updateById(requestId, { category: detectedCategory });
      })
      .then((result) => {
        if (result?.error) console.warn('AI category auto-fill failed:', result.error.message);
      })
      .catch((error) => console.warn('AI category auto-fill skipped:', error.message));
  }

  return {
    status: 201,
    body: {
      message: photoUrl
        ? 'Repair request submitted successfully!'
        : 'Repair request submitted successfully. The photo could not be uploaded.',
      photoUploaded: Boolean(photoUrl),
      requestId,
      request: newRequest,
    },
  };
};

module.exports = { submitRequest };
