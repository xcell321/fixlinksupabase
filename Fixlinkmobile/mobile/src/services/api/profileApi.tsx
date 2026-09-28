// Profile, platform catalog and portfolio endpoints.
import api from './client';
import { appendUploadFile, buildUploadFile, type PickedFile } from './upload';

export const fetchPlatformCategories = async (): Promise<unknown> => (await api.get('/users/platform/categories')).data;
export const fetchAnnouncements = async (): Promise<unknown> => (await api.get('/users/platform/announcements')).data;
export const fetchTechnicianProfile = async (uid: string): Promise<unknown> =>
  (await api.get(`/users/${uid}/profile`)).data;
export const fetchTechnicianSchedule = async (uid: string, date?: string): Promise<unknown> =>
  (await api.get(`/users/${encodeURIComponent(uid)}/schedule`, { params: date ? { date } : undefined })).data;
export const updateTechnicianProfile = async (
  uid: string,
  profile: {
    name?: string;
    phone?: string;
    address?: string;
    bio?: string;
    skills?: string | string[];
    yearsExperience?: number | string;
    latitude?: number;
    longitude?: number;
    profileImage?: PickedFile | null;
  },
): Promise<unknown> => {
  const { profileImage, ...fields } = profile;
  // Plain JSON when no new picture was picked; multipart only when one was,
  // so the technician avatar rides the same route as the customer avatar.
  if (!profileImage?.uri) {
    return (await api.put(`/profile/${encodeURIComponent(uid)}/technician`, fields)).data;
  }
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    formData.append(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  await appendUploadFile(formData, 'profileImage', profileImage, 'profile-image.jpg', 'image/jpeg');
  return (await api.put(`/profile/${encodeURIComponent(uid)}/technician`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })).data;
};
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
