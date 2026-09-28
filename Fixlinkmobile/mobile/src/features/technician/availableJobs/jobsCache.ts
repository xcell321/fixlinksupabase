// Per-technician feed cache for the Available Jobs screen.
// Moved verbatim from AvailableJobsScreen.tsx. Survives unmount so a
// remount restores the last feed instantly instead of flashing skeletons.
import type { JobItem } from '../availableJobsHelpers';

export interface CachedFeed {
  jobs: JobItem[];
  acceptedJobs: JobItem[];
  lastSyncAt: Date | null;
  fetchError: boolean;
}

export const jobsCache = new Map<string, CachedFeed>();
