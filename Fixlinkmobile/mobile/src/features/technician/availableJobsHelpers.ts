export interface JobItem {
  id: string;
  status?: string;
  applianceType?: string;
  customerName?: string;
  location?: string;
  latitude?: number | string;
  longitude?: number | string;
  distanceKm?: number;
  description?: string;
  preferredDate?: string;
  preferredTime?: string;
  scheduledDate?: string;
  technicianArrivalAt?: string;
  technicianUid?: string;
  technicianName?: string;
  photoUrl?: string | null;
  urgency?: 'urgent' | 'normal' | 'scheduled';
  estimatedPayout?: string;
}

export type WorkloadStatus = 'available' | 'busy' | 'at_capacity';

export interface WorkloadSummary {
  status: WorkloadStatus;
  activeCount: number;
  remainingCapacity: number;
  label: string;
}

export interface FilterOptions {
  category?: string;
  searchQuery?: string;
  maxDistanceKm?: number;
  highlightedJobId?: string | null;
}

/**
 * Returns workload display status according to active job count.
 * Matches backend threshold:
 * 0 to 2: available
 * 3 to 5: busy
 * 6 or more: at_capacity
 */
export function getWorkloadDisplayStatus(count: number): WorkloadStatus {
  if (count >= 6) {
    return 'at_capacity';
  }
  if (count >= 3) {
    return 'busy';
  }
  return 'available';
}

/**
 * Computes workload summary including remaining capacity until hard limit (6).
 */
export function calculateWorkloadSummary(activeCount: number, maxCapacity: number = 6): WorkloadSummary {
  const status = getWorkloadDisplayStatus(activeCount);
  const remaining = Math.max(0, maxCapacity - activeCount);
  const label = status === 'at_capacity'
    ? 'At Capacity'
    : status === 'busy'
      ? 'Busy'
      : 'Available';

  return {
    status,
    activeCount,
    remainingCapacity: remaining,
    label
  };
}

/**
 * Validates that an OTP code consists of exactly four digits.
 */
export function validateOtpCode(code: string): boolean {
  const trimmed = code.trim();
  return /^\d{4}$/.test(trimmed);
}

/**
 * Formats job schedule strings cleanly for mobile display.
 */
export function formatJobSchedule(job: JobItem): string {
  if (job?.preferredDate && job?.preferredTime) {
    return `${job.preferredDate} (at) ${job.preferredTime}`;
  }
  if (job?.preferredTime) {
    return job.preferredTime;
  }
  if (job?.preferredDate) {
    return job.preferredDate;
  }
  if (job?.scheduledDate) {
    try {
      const d = new Date(job.scheduledDate);
      if (!isNaN(d.getTime())) {
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (at) ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      }
    } catch {
      return String(job.scheduledDate);
    }
  }
  return 'Schedule to confirm';
}

/**
 * Filters jobs based on category, search query, and distance threshold.
 */
export function filterJobs(jobs: JobItem[], options: FilterOptions): JobItem[] {
  const { category, searchQuery, maxDistanceKm, highlightedJobId } = options;

  return jobs.filter((job) => {
    if (highlightedJobId && String(job.id) === String(highlightedJobId)) {
      return true;
    }

    if (maxDistanceKm != null && job.distanceKm != null) {
      if (Number(job.distanceKm) > maxDistanceKm) {
        return false;
      }
    }

    if (category && category !== 'all') {
      const targetCategory = category.toLowerCase();
      const jobAppliance = String(job.applianceType ?? '').toLowerCase();
      const match =
        (targetCategory === 'aircon' && (jobAppliance.includes('air') || jobAppliance.includes('cooling') || jobAppliance.includes('aircon'))) ||
        (targetCategory === 'refrigerator' && (jobAppliance.includes('fridge') || jobAppliance.includes('refrigerator') || jobAppliance.includes('freezer'))) ||
        (targetCategory === 'washing' && (jobAppliance.includes('wash') || jobAppliance.includes('laundry'))) ||
        (targetCategory === 'computer' && (jobAppliance.includes('laptop') || jobAppliance.includes('pc') || jobAppliance.includes('computer') || jobAppliance.includes('desktop'))) ||
        (targetCategory === 'tv' && (jobAppliance.includes('tv') || jobAppliance.includes('television') || jobAppliance.includes('audio'))) ||
        jobAppliance.includes(targetCategory);

      if (!match) {
        return false;
      }
    }

    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      const appliance = String(job.applianceType ?? '').toLowerCase();
      const customer = String(job.customerName ?? '').toLowerCase();
      const desc = String(job.description ?? '').toLowerCase();
      const location = String(job.location ?? '').toLowerCase();

      const matched =
        appliance.includes(q) ||
        customer.includes(q) ||
        desc.includes(q) ||
        location.includes(q);

      if (!matched) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Checks if job status allows physical arrival recording.
 * Allowed statuses: 'Accepted', 'Confirmed', 'Customer Ready'.
 */
export function isArrivalAllowed(status?: string): boolean {
  if (!status) {
    return false;
  }
  const normalized = status.trim().toLowerCase();
  return normalized === 'accepted' || normalized === 'confirmed' || normalized === 'customer ready';
}

/**
 * Checks if the technician can mark arrival for a given job.
 */
export function canMarkArrival(job: { status?: string; technicianArrivalAt?: string | null }): boolean {
  if (job.technicianArrivalAt) {
    return false;
  }
  return isArrivalAllowed(job.status);
}

/**
 * Checks if the technician can start the repair for a given job.
 */
export function canStartRepair(job: { status?: string; technicianArrivalAt?: string | null }): boolean {
  if (!job.technicianArrivalAt) {
    return false;
  }
  const normalized = String(job.status || '').trim().toLowerCase();
  return normalized !== 'in progress' && normalized !== 'completed' && normalized !== 'cancelled';
}

export interface CredentialBadgeInfo {
  isVerified: boolean;
  badgeLabel: string;
  badgeSublabel: string;
  icon: 'shield-checkmark' | 'shield-outline';
  statusDescription: string;
}

export function getTechnicianCredentialBadgeInfo(technician?: {
  verified?: boolean;
  verificationStatus?: string;
  status?: string;
}): CredentialBadgeInfo {
  const isVerified = Boolean(
    technician?.verified === true ||
    technician?.verificationStatus === 'verified' ||
    technician?.status === 'active'
  );

  if (isVerified) {
    return {
      isVerified: true,
      badgeLabel: 'Verified Pro',
      badgeSublabel: 'TESDA Accredited',
      icon: 'shield-checkmark',
      statusDescription: 'Your technical credentials and government identification are verified and active.',
    };
  }

  return {
    isVerified: false,
    badgeLabel: 'Verification Pending',
    badgeSublabel: 'Under Review',
    icon: 'shield-outline',
    statusDescription: 'Your credentials are under review by FixLink administrators.',
  };
}


