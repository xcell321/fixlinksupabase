// Shared types + constants for the technician Available Jobs feature.
// Moved verbatim from AvailableJobsScreen.tsx. No behavior change.
import type { Ionicons } from '@expo/vector-icons';
import type { JobItem } from '../availableJobsHelpers';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface Coords {
  [key: string]: unknown;
  latitude: number;
  longitude: number;
}

export interface TechnicianRef {
  uid: string;
  name?: string;
  latitude?: number | string;
  longitude?: number | string;
  verified?: boolean;
  verificationStatus?: string;
  status?: string;
  profileImage?: string | null;
}

export interface AvailableJobsScreenProps {
  technician: TechnicianRef;
  onNavigateToMap?: (job: JobItem) => void;
  onNavigateToChat?: (job: JobItem) => void;
  onOpenNotifications?: () => void;
  notificationCount?: number;
  highlightedJobId?: string | null;
}

export const NEARBY_QUEUE_RADIUS_KM = 20;

export const CATEGORY_CHIPS = [
  { id: 'all', label: 'All Jobs', icon: 'grid-outline' as IconName },
  { id: 'aircon', label: 'Aircon', icon: 'snow-outline' as IconName },
  { id: 'refrigerator', label: 'Refrigerator', icon: 'cube-outline' as IconName },
  { id: 'washing', label: 'Washing', icon: 'water-outline' as IconName },
  { id: 'computer', label: 'Computer', icon: 'laptop-outline' as IconName },
];
