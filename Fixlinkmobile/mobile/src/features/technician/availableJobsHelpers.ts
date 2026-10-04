import { noShowWaitState, type NoShowWaitState } from '../../utils/noShowPolicy';

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
  // UAT #6: fake / AI-generated device-photo warning.
  photoRiskScore?: number | null;
  photoRiskLevel?: string | null;
  photoFlags?: string[] | null;
  photoNotes?: string | null;
  // UAT #5: fake-address / harassment warning.
  safetyFlags?: string[] | null;
  safetyLevel?: string | null;
  // UAT #11: customer context shown on the rating card.
  customerProfile?: {
    uid?: string;
    name?: string | null;
    profileImage?: string | null;
    portfolio?: string[];
    verified?: boolean;
    riskLevel?: string | null;
    rating?: number | null;
    totalReviews?: number | null;
  } | null;
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
 * UAT #2: how far through the no-show wait window a job is. Reporting a
 * customer no-show is refused by the server until the technician has recorded
 * an arrival and waited the window, so the card uses this to show a countdown
 * instead of letting a request fail.
 */
export function noShowState(job: { technicianArrivalAt?: string | null }): NoShowWaitState {
  return noShowWaitState(job);
}

/** Whether the technician may file a customer no-show right now. */
export function canReportNoShow(job: { technicianArrivalAt?: string | null }): boolean {
  return noShowWaitState(job).ready;
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

// ---------------------------------------------------------------------------
// UAT #5 — fake-address / harassment warnings.
//
// `domain/requestSafety` and `domain/photoScreening` on the backend classify a
// booking as 'flagged' or 'high'. These helpers are the single source of truth
// for how that verdict is rendered, so the queue card and the detail sheet
// cannot drift apart.
// ---------------------------------------------------------------------------

/** Risk levels that warrant a visible warning chip. */
export const WARNING_RISK_LEVELS: readonly string[] = ['flagged', 'high'];

// Mirrors domain/requestSafety FLAGS. Unknown flags still render (underscores
// become spaces) so a newly added backend flag degrades instead of disappearing.
const SAFETY_FLAG_LABELS: Readonly<Record<string, string>> = {
  address_too_short: 'incomplete address',
  address_gibberish: 'address looks fake',
  address_repeated_chars: 'address looks fake',
  customer_not_near_address: 'customer is not near the address',
  address_targeted_today: 'many bookings at this address today',
  duplicate_request: 'repeated request',
};

export function safetyFlagLabel(flag: string): string {
  const key = String(flag || '').trim().toLowerCase();
  if (!key) return '';
  return SAFETY_FLAG_LABELS[key] || key.replace(/_/g, ' ');
}

/** Reasons joined for display, e.g. "address looks fake, repeated request". */
export function safetyFlagSummary(job: Pick<JobItem, 'safetyFlags'>): string {
  const labels = Array.from(
    new Set((job?.safetyFlags || []).map(safetyFlagLabel).filter(Boolean))
  );
  return labels.join(', ');
}

export function hasSafetyWarning(job: Pick<JobItem, 'safetyLevel'>): boolean {
  return WARNING_RISK_LEVELS.includes(String(job?.safetyLevel || '').trim().toLowerCase());
}

/** Photo flags that prove AI involvement on their own, even at a low merged score. */
const AI_PHOTO_FLAGS: readonly string[] = ['ai_generated', 'ai_tool_marker'];

export function hasPhotoWarning(job: Pick<JobItem, 'photoRiskLevel' | 'photoFlags'>): boolean {
  if (WARNING_RISK_LEVELS.includes(String(job?.photoRiskLevel || '').trim().toLowerCase())) return true;
  const raw: unknown = job?.photoFlags;
  const list: unknown[] = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
  return list.some((flag) => AI_PHOTO_FLAGS.includes(String(flag ?? '').trim().toLowerCase()));
}

/** One-line warning for the queue card, shown before the job is accepted. */
export function safetyWarningText(job: Pick<JobItem, 'safetyFlags'>): string {
  const reasons = safetyFlagSummary(job);
  return reasons
    ? `Safety check flagged this booking: ${reasons}. Confirm the address before travelling.`
    : 'Safety check flagged this booking as a possible fake address or repeated request. Confirm the address before travelling.';
}

