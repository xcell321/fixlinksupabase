// Job lifecycle: the single place that knows which statuses mean what.
//
// Every status list below used to be duplicated inline across the request
// handlers, which is how the feed, the cancel rules and the no-show rules
// could drift apart. Grouping them here keeps them consistent.

// Statuses in which a customer may still cancel their own request.
// ("Customer Ready" is included: the technician has not started work yet.)
const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'accepted', 'confirmed', 'customer ready'];

// Statuses where the technician is assigned and travelling / ready to work.
const TECHNICIAN_EN_ROUTE_STATUSES = ['accepted', 'confirmed', 'customer ready'];

// Statuses in which a no-show can be reported (adds "in progress").
const NO_SHOW_REPORTABLE_STATUSES = ['accepted', 'confirmed', 'customer ready', 'in progress'];

// Statuses that permit live tracking. Compared case-sensitively against the
// stored DB status, exactly as before.
const LIVE_TRACKING_STATUSES = ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'];

// Statuses a technician may set through the status shortcut endpoint.
const TECHNICIAN_SETTABLE_STATUSES = ['In Progress', 'Completed', 'Cancelled'];

const normalizeStatus = (status) => String(status || '').toLowerCase();

const isCustomerCancellable = (status) => CUSTOMER_CANCELLABLE_STATUSES.includes(normalizeStatus(status));

const isTechnicianEnRoute = (status) => TECHNICIAN_EN_ROUTE_STATUSES.includes(normalizeStatus(status));

const isNoShowReportable = (status) => NO_SHOW_REPORTABLE_STATUSES.includes(normalizeStatus(status));

const isLiveTrackable = (status) => LIVE_TRACKING_STATUSES.includes(status);

// Stage of the request used to classify cancellations and no-shows.
const stageOf = (status) => {
  switch (normalizeStatus(status)) {
    case 'pending': return 'before_accept';
    case 'accepted': return 'after_accept';
    case 'confirmed': return 'after_confirmation';
    case 'customer ready': return 'after_ready';
    case 'in progress': return 'after_travel';
    default: return null;
  }
};

module.exports = {
  CUSTOMER_CANCELLABLE_STATUSES,
  TECHNICIAN_EN_ROUTE_STATUSES,
  NO_SHOW_REPORTABLE_STATUSES,
  LIVE_TRACKING_STATUSES,
  TECHNICIAN_SETTABLE_STATUSES,
  normalizeStatus,
  isCustomerCancellable,
  isTechnicianEnRoute,
  isNoShowReportable,
  isLiveTrackable,
  stageOf,
};
