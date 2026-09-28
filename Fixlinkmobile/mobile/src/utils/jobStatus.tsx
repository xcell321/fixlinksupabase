// Single source of truth for job active-status checks.
// Previously copied verbatim into Dashboard, Chat, RequestProgress,
// AvailableJobs and both tracking screens.
export const ACTIVE_STATUSES = ['accepted', 'confirmed', 'customer ready', 'in progress'];

export const isActiveStatus = (status: unknown): boolean =>
  ACTIVE_STATUSES.includes(String(status ?? '').trim().toLowerCase());

export const getStatusColor = (status: unknown): string => {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'completed') return '#16a34a';
  if (normalized === 'cancelled' || normalized === 'no-show') return '#dc2626';
  if (normalized === 'in progress') return '#2563eb';
  if (normalized === 'accepted' || normalized === 'confirmed' || normalized === 'customer ready') return '#d97706';
  return '#6b7280';
};
