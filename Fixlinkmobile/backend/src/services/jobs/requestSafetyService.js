// Request-safety service (UAT #5).
//
// Runs on every submission and answers three questions:
//   1. Is the address a real, usable address?          (invalid -> hard block)
//   2. Is the customer actually near that address?     (far -> flag, or block)
//   3. Is this a repeated / spam booking?              (same customer -> block,
//                                                       many at one address -> flag)
//
// Blocking "many bookings at one address" would let an attacker lock a victim
// out of their own address, so that case is advisory only: it warns the
// technician instead.

const jobRepository = require('../../repositories/jobRepository');
const userRepository = require('../../repositories/userRepository');
const { distanceInKm } = require('../../domain/geo');
const safety = require('../../domain/requestSafety');

const INVALID_ADDRESS_FLAGS = [
  safety.FLAGS.ADDRESS_TOO_SHORT,
  safety.FLAGS.ADDRESS_GIBBERISH,
  safety.FLAGS.ADDRESS_REPEATED_CHARS,
];

// True when the verdict is a validation error (400) rather than a rate-limit (429).
const isInvalidAddress = (verdict) => (verdict.flags || []).some((flag) => INVALID_ADDRESS_FLAGS.includes(flag));

const assessRequest = async ({
  customerUid,
  address,
  description,
  applianceType,
  serviceLatitude,
  serviceLongitude,
  now = new Date(),
}) => {
  const clear = { blocked: false, reason: null, flags: [], level: safety.LEVELS.LOW };
  if (!safety.isRequestSafetyEnabled()) return clear;

  // 1. Address sanity.
  const addressCheck = safety.inspectAddress(address);
  if (!addressCheck.ok) {
    return { blocked: true, reason: addressCheck.reason, flags: addressCheck.flags, level: safety.LEVELS.HIGH };
  }

  const flags = [];
  const hasServiceCoords = Number.isFinite(Number(serviceLatitude)) && Number.isFinite(Number(serviceLongitude));

  // 2. Is the customer near the address they are booking?
  if (customerUid && hasServiceCoords) {
    try {
      const customer = await userRepository.findById(customerUid);
      const distance = distanceInKm(
        Number(customer?.latitude), Number(customer?.longitude),
        Number(serviceLatitude), Number(serviceLongitude)
      );
      if (distance != null && distance > safety.addressGpsToleranceKm()) {
        flags.push(safety.FLAGS.CUSTOMER_NOT_NEAR_ADDRESS);
        if (safety.addressEnforcement() === 'block') {
          return {
            blocked: true,
            reason: 'Your phone is far from the service address you entered. Please confirm the correct address.',
            flags,
            level: safety.LEVELS.HIGH,
          };
        }
      }
    } catch (error) {
      console.warn('Address proximity check skipped:', error.message);
    }
  }

  // 3a. Same customer re-submitting near-identical requests (self-spam).
  if (customerUid) {
    try {
      const own = await jobRepository.findByCustomerUid(customerUid);
      const windowMs = safety.spamWindowHours() * 3600 * 1000;
      const candidate = `${description} ${address}`;
      const similar = (own || []).filter((job) => {
        const time = job.created_at ? new Date(job.created_at).getTime() : NaN;
        if (!Number.isFinite(time) || now.getTime() - time > windowMs) return false;
        return safety.similarity(`${job.description} ${job.confirmed_service_location || job.location}`, candidate)
          >= safety.spamSimilarityThreshold();
      });
      if (similar.length >= safety.spamMaxMatches()) {
        return {
          blocked: true,
          reason: 'You already have very similar repair requests. Please wait before booking again, or update the existing one.',
          flags: [...flags, safety.FLAGS.DUPLICATE_REQUEST],
          level: safety.LEVELS.HIGH,
        };
      }
    } catch (error) {
      console.warn('Duplicate-request check skipped:', error.message);
    }
  }

  // 3b. Many bookings aimed at the same address today (advisory).
  try {
    const atAddress = await jobRepository.findByLocationLike(address);
    const today = safety.dayKey(now);
    const normalized = safety.normalizeAddress(address);
    const todayAtAddress = (atAddress || []).filter((job) => safety.dayKey(job.created_at) === today
      && safety.normalizeAddress(job.confirmed_service_location || job.location) === normalized);
    if (todayAtAddress.length >= safety.addressDailyCap()) flags.push(safety.FLAGS.ADDRESS_TARGETED_TODAY);
  } catch (error) {
    console.warn('Address-targeting check skipped:', error.message);
  }

  return { blocked: false, reason: null, flags, level: safety.levelForFlags(flags) };
};

module.exports = { assessRequest, isInvalidAddress, INVALID_ADDRESS_FLAGS };
