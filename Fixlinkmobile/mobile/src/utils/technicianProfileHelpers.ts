export interface TechnicianProfileData {
  name?: string;
  phone?: string;
  address?: string;
  email?: string;
  bio?: string;
  skills?: string[] | string;
  yearsExperience?: number | string;
  verified?: boolean;
  completedJobs?: number;
  averageRating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  reviews?: Array<{
    rating: number;
    comment?: string;
    createdAt?: string | null;
  }>;
  portfolio?: Array<{
    url: string;
  }>;
  profileImage?: string | null;
  verifiedAt?: string | null;
  totalEarned?: string | number;
}

export interface TechnicianDraft {
  name: string;
  phone: string;
  address: string;
  bio: string;
  skills: string;
  yearsExperience: string;
}

export const EMPTY_DRAFT: TechnicianDraft = {
  name: '',
  phone: '',
  address: '',
  bio: '',
  skills: '',
  yearsExperience: '',
};

export function formatExperience(years: number | string | undefined | null): string {
  if (years === undefined || years === null || years === '') {
    return '0 yrs';
  }
  const numeric = typeof years === 'number' ? years : Number(years);
  if (Number.isNaN(numeric) || numeric === 0) {
    return '0 yrs';
  }
  if (numeric === 1) {
    return '1 yr';
  }
  return `${numeric} yrs`;
}

export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || rating === 0) {
    return 'N/A';
  }
  return Number(rating).toFixed(1);
}

export function formatTotalEarned(earned?: number | string | null): string {
  if (earned === undefined || earned === null || earned === '') {
    return '$0';
  }
  const num = typeof earned === 'string' ? parseFloat(earned) : earned;
  if (isNaN(num) || num === 0) {
    return '$0';
  }
  if (num >= 1000) {
    return `$${(num / 1000).toFixed(1)}k`;
  }
  return `$${num.toFixed(0)}`;
}

export function formatReviewDate(dateStr?: string | null): string {
  if (!dateStr) {
    return '';
  }
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) {
    return '';
  }
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatSkillList(skills?: string[] | string | null): string[] {
  if (!skills) {
    return [];
  }
  if (Array.isArray(skills)) {
    return skills.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(skills)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function draftFromProfile(profile: TechnicianProfileData): TechnicianDraft {
  const rawSkills = profile.skills;
  const skillsText = Array.isArray(rawSkills)
    ? rawSkills.join(', ')
    : String(rawSkills ?? '');

  return {
    name: profile.name ?? '',
    phone: profile.phone ?? '',
    address: profile.address ?? '',
    bio: profile.bio ?? '',
    skills: skillsText,
    yearsExperience: profile.yearsExperience !== undefined && profile.yearsExperience !== null
      ? String(profile.yearsExperience)
      : '',
  };
}

export function getVerificationBadge(verified?: boolean, verifiedAt?: string | null): {
  label: string;
  icon: 'shield-checkmark' | 'shield-outline';
  isVerified: boolean;
  verifiedSince?: string;
} {
  if (verified) {
    return {
      label: `Verified Technician`,
      icon: 'shield-checkmark',
      isVerified: true,
      verifiedSince: verifiedAt ?? undefined,
    };
  }
  return {
    label: 'Verification Pending',
    icon: 'shield-outline',
    isVerified: false,
    verifiedSince: undefined,
  };
}
