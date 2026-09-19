export type UserRole = 'customer' | 'technician' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface User {
  uid: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status?: 'active' | 'pending_verification' | 'rejected';
  verificationStatus?: VerificationStatus;
  skills?: string[];
  latitude?: number;
  longitude?: number;
  profileImage?: string;
  rating?: number;
  totalReviews?: number;
  idToken?: string;
}
