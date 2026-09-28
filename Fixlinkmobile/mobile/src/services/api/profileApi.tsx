// Profile, platform catalog and portfolio endpoints.
import api from './client';
import { buildUploadFile } from './upload';

export const fetchPlatformCategories = async (): Promise<unknown> => (await api.get('/users/platform/categories')).data;
export const fetchAnnouncements = async (): Promise<unknown> => (await api.get('/users/platform/announcements')).data;
export const fetchTechnicianProfile = async (uid: string): Promise<unknown> =>
  (await api.get(`/users/${uid}/profile`)).data;
export const fetchTechnicianSchedule = async (uid: string, date?: string): Promise<unknown> =>
  (await api.get(`/users/${encodeURIComponent(uid)}/schedule`, { params: date ? { date } : undefined })).data;
export const updateTechnicianProfile = async (uid: string, profile: unknown): Promise<unknown> =>
  (await api.put(`/profile/${encodeURIComponent(uid)}/technician`, profile)).data;
export const updateCustomerProfile = async (uid: string, profile: { name?: string; phone?: string; address?: string; profileImage?: { uri: string; fileName?: string; mimeType?: string } }): Promise<unknown> => {
  const formData = new FormData();
  formData.append('name', profile.name ?? '');
  formData.append('phone', profile.phone ?? '');
  formData.append('address', profile.address ?? '');
  if (profile.profileImage?.uri) {
    formData.append(
      'profileImage',
      (await buildUploadFile(profile.profileImage, 'profile-image.jpg', 'image/jpeg')) as unknown as Blob,
    );
  }
  return (await api.put(`/profile/${encodeURIComponent(uid)}/profile`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })).data;
};

export const uploadPortfolioPhotos = async (uid: string, photos: Array<{ uri: string; fileName?: string; name?: string; mimeType?: string; type?: string }>): Promise<unknown> => {
  const formData = new FormData();
  for (const photo of photos) {
    formData.append(
      'photos',
      (await buildUploadFile(photo, 'portfolio-photo.jpg', 'image/jpeg')) as unknown as Blob,
    );
  }
  return (await api.post(`/users/${uid}/portfolio`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })).data;
};
