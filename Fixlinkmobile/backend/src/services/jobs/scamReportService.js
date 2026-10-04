// Scam-report service: POST /api/requests/:id/report-scam.
//
// UAT #8 — either party to a request can report the other as a scammer once
// work has started or finished. Incidents are written atomically through the
// `record_scam_incident` RPC, which keeps the reported user's running
// `scam_count`. When the count reaches the configured limit the customer is
// auto-suspended.

const jobRepository = require('../../repositories/jobRepository');
const { HttpError } = require('../../domain/httpError');
const { isScamReportable } = require('../../domain/jobWorkflow');
const { shouldAutoSuspend, customerScamLimit } = require('../../domain/scamPolicy');
const { suspendAccount } = require('./accountSuspension');

const incidentCount = (data) => {
  if (typeof data === 'number') return data;
  if (Array.isArray(data)) return incidentCount(data[0]);
  if (data && typeof data === 'object') {
    return Number(data.scam_count ?? data.count ?? data.record_scam_incident ?? 0);
  }
  return Number(data) || 0;
};

// POST /api/requests/:id/report-scam
const reportScam = async ({ jobId, authUid, reason }) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Repair request not found.' });

  const isReporterCustomer = job.customer_uid && String(job.customer_uid) === String(authUid);
  const isReporterTechnician = job.technician_uid && String(job.technician_uid) === String(authUid);
  if (!isReporterCustomer && !isReporterTechnician) {
    throw new HttpError(403, { error: 'You can only report a party on your own request.' });
  }
  if (!isScamReportable(job.status)) {
    throw new HttpError(409, { error: 'This request can only be reported once work has started or finished.' });
  }

  const reporterRole = isReporterCustomer ? 'customer' : 'technician';
  const reportedUid = isReporterCustomer ? job.technician_uid : job.customer_uid;
  const reportedRole = isReporterCustomer ? 'technician' : 'customer';
  if (!reportedUid) {
    throw new HttpError(409, { error: 'There is no other party on this request to report.' });
  }

  const { data, error } = await jobRepository.recordScamIncident({
    jobId: job.id,
    reporterUid: authUid,
    reporterRole,
    reportedUid,
    reportedRole,
    reason: String(reason || '').trim() || null,
  });
  if (error) {
    console.error('Scam report failed:', error.message);
    throw new HttpError(500, { error: 'Unable to file the scam report.' });
  }

  const count = incidentCount(data);
  // Auto-suspend applies to customers only, matching the repeat-scammer
  // requirement; a reported technician is left for admin review.
  let suspended = false;
  if (reportedRole === 'customer' && shouldAutoSuspend(count)) {
    suspended = await suspendAccount(reportedUid, { reason: 'repeat scam reports' });
  }

  return {
    status: 201,
    body: {
      message: suspended
        ? `Scam report filed. The account was suspended after reaching ${customerScamLimit()} reports.`
        : 'Scam report filed. Our team will review it.',
      scamCount: count,
      suspended,
    },
  };
};

module.exports = { reportScam };
