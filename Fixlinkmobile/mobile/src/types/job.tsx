export type JobStatus =
  | 'Pending'
  | 'Accepted'
  | 'Confirmed'
  | 'Customer Ready'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled'
  | 'No-Show';

export interface Job {
  id: string;
  customerUid?: string;
  customerName: string;
  technicianUid?: string;
  technicianName?: string;
  applianceType: string;
  category?: string;
  description: string;
  location: string;
  latitude?: number;
  longitude?: number;
  status: JobStatus;
  verificationCode?: string;
  preferredDate?: string;
  preferredTime?: string;
  scheduledDate?: string;
  photoUrl?: string;
  createdAt?: string;
  distanceKm?: number;
}
