// Session + navigation shared types. Extracted from AppNavigator.tsx so
// screens, hooks and notification helpers import one canonical shape.
export type AuthRole = 'customer' | 'technician';

// Fields are optional because the API payload grows with the profile forms.
export type SessionUser = {
  // Always present: a session without a uid is not a logged-in user.
  uid: string;
  id?: string;
  // The login/register response always carries a display name.
  name: string;
  email?: string;
  // The app only ever navigates customer and technician sessions.
  role: AuthRole;
  phone?: string;
  address?: string;
  idToken?: string;
  profileImage?: string | null;
  latitude?: number | string;
  longitude?: number | string;
};

// A job as held by the navigator. `id` is required: every screen that receives
// one uses it to act on the job (and RequestDetailsScreen requires it).
export type SelectedJob = {
  id: string;
  status?: string;
  applianceType?: string;
  // Snake_case alias some endpoints still return; kept as a read fallback.
  appliance_type?: string;
  description?: string;
  location?: string;
  photoUrl?: string | null;
  verificationCode?: string;
  createdAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  technicianUid?: string;
  technicianName?: string;
  technicianRating?: number | string | null;
  technicianTotalReviews?: number | string | null;
  customerName?: string;
  preferredTime?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

// Notification row. The first three fields are required because the banner
// component requires them and the feed always renders `text`.
export type NotificationItem = {
  id: string;
  text: string;
  createdAt?: string;
  jobId?: string;
  read?: boolean;
  senderName?: string;
};

export type NavTab = { key: string; label: string; icon: string };
