import axios from 'axios';
import Constants from 'expo-constants';

const devHost: string = String((Constants.expoConfig as { hostUri?: string } | undefined)?.hostUri ?? '').split(':')[0] || 'localhost';

export const API_BASE_URL: string = `http://${devHost}:5050/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAuthToken = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

type Coords = { latitude?: number; longitude?: number };

export const submitRepairRequest = async (requestData: Record<string, unknown>): Promise<unknown> => {
  try {
    const formData = new FormData();
    Object.entries(requestData).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        const v = value as { uri?: string; fileName?: string; mimeType?: string };
        if (key === 'photo' && v.uri) {
          formData.append('photo', {
            uri: v.uri,
            name: v.fileName ?? 'repair-photo.jpg',
            type: v.mimeType ?? 'image/jpeg',
          } as unknown as Blob);
        } else {
          formData.append(key, String(value));
        }
      }
    });
    const response = await api.post('/requests', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : { error: 'Network Error' };
  }
};

export const registerUser = async (userData: Record<string, unknown>): Promise<unknown> => {
  const formData = new FormData();
  const getMimeType = (file: { mimeType?: string; name?: string }): string => {
    if (file.mimeType) return file.mimeType;
    const extension = file.name?.split('.').pop()?.toLowerCase();
    return extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
  };
  Object.entries(userData).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      const v = value as { uri?: string; name?: string; mimeType?: string };
      if ((key === 'governmentIdFile' || key === 'certificateFile') && v.uri) {
        formData.append(key, {
          uri: v.uri,
          name: v.name ?? 'verification-document',
          type: getMimeType(v as { mimeType?: string; name?: string }),
        } as unknown as Blob);
      } else {
        formData.append(key, String(value));
      }
    }
  });
  const response = await api.post('/auth/register', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const fetchRepairRequests = async (technicianUid?: string, coords?: Coords): Promise<unknown> => {
  try {
    const params: Record<string, unknown> = {};
    if (technicianUid) params.technicianUid = technicianUid;
    if (coords?.latitude && coords?.longitude) {
      params.latitude = coords.latitude;
      params.longitude = coords.longitude;
    }
    const response = await api.get('/requests', { params: Object.keys(params).length ? params : undefined });
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : { error: 'Network Error' };
  }
};
export const acceptRepairRequest = async (jobId: string, technicianUid: string, technicianName: string): Promise<unknown> =>
  (await api.put(`/requests/${encodeURIComponent(jobId)}/accept`, { technicianUid, technicianName })).data;

export const fetchPlatformCategories = async (): Promise<unknown> => (await api.get('/users/platform/categories')).data;
export const fetchAnnouncements = async (): Promise<unknown> => (await api.get('/users/platform/announcements')).data;
export const fetchCompletedJobs = async (customerName: string, customerUid?: string): Promise<unknown> =>
  (await api.get(`/requests/completed/${encodeURIComponent(customerName)}`, { params: customerUid ? { customerUid } : undefined })).data;
export const fetchCustomerRequests = async (customerName: string, customerUid?: string): Promise<unknown> =>
  (await api.get(`/requests/customer/${encodeURIComponent(customerName)}`, { params: customerUid ? { customerUid } : undefined })).data;
export const fetchTechnicianJobs = async (technicianUid: string): Promise<unknown> =>
  (await api.get(`/requests/technician/${encodeURIComponent(technicianUid)}`)).data;
export const fetchTechnicianWorkload = async (technicianUid: string): Promise<unknown> =>
  (await api.get(`/requests/technician/${encodeURIComponent(technicianUid)}/workload`)).data;
export const fetchJobMessages = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/accepted/${encodeURIComponent(jobId)}/messages`)).data;
export const sendJobMessage = async (jobId: string, messageData: unknown): Promise<unknown> =>
  (await api.post(`/requests/accepted/${encodeURIComponent(jobId)}/messages`, messageData)).data;
export const fetchUnreadMessageNotifications = async (uid: string, role: string): Promise<unknown> =>
  (await api.get('/requests/messages/unread', { params: { uid, role } })).data;
export const fetchNotifications = async (): Promise<unknown> =>
  (await api.get('/requests/notifications')).data;
export const markNotificationRead = async (notificationId: string): Promise<unknown> =>
  (await api.put(`/requests/notifications/${encodeURIComponent(notificationId)}/read`)).data;
export const fetchJobById = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/job/${encodeURIComponent(jobId)}`)).data;
export const fetchMessageInbox = async (uid: string, role: string): Promise<unknown> =>
  (await api.get('/requests/messages/inbox', { params: { uid, role } })).data;
export const markJobMessagesRead = async (jobId: string, viewerUid: string): Promise<unknown> =>
  (await api.put(`/requests/accepted/${encodeURIComponent(jobId)}/messages/read`, { viewerUid })).data;
export const declineRepairRequest = async (jobId: string, technicianUid: string): Promise<unknown> =>
  (await api.put(`/requests/${jobId}/decline`, { technicianUid })).data;
export const cancelRepairRequest = async (requestId: string, cancellationReason: string): Promise<unknown> =>
  (await api.put(`/requests/${encodeURIComponent(requestId)}/cancel`, { cancellationReason })).data;
export const updateJobStatus = async (jobId: string, status: string, technicianUid: string, cancellationReason?: string): Promise<unknown> => {
  try {
    return (await api.put(`/requests/accepted/${jobId}/status`, { status, technicianUid, cancellationReason })).data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : error;
  }
};
export const confirmRepairRequest = async (jobId: string): Promise<unknown> => {
  try {
    return (await api.post(`/requests/${encodeURIComponent(jobId)}/confirm-repair`)).data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : error;
  }
};
export const markCustomerReady = async (jobId: string): Promise<unknown> => {
  try {
    return (await api.post(`/requests/${encodeURIComponent(jobId)}/customer-ready`)).data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : error;
  }
};
export const recordTechnicianArrival = async (jobId: string, technicianUid: string): Promise<unknown> => {
  try {
    return (await api.post(`/requests/${encodeURIComponent(jobId)}/arrive`, { technicianUid })).data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : error;
  }
};
export const reportNoShow = async (jobId: string, technicianUid: string, reason: string): Promise<unknown> => {
  try {
    return (await api.post(`/requests/${encodeURIComponent(jobId)}/report-no-show`, { technicianUid, reason })).data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : error;
  }
};
export const fetchAcceptedJobLocation = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/accepted/${jobId}/location`)).data;
export const fetchJobLiveTracking = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/accepted/${jobId}/live-tracking`)).data;
export const updateCustomerLocation = async (jobId: string, customerUid: string, location: Record<string, unknown>): Promise<unknown> =>
  (await api.put(`/requests/accepted/${jobId}/customer-location`, { customerUid, ...location })).data;
export const updateTechnicianLocation = async (uid: string, location: Record<string, unknown>): Promise<unknown> =>
  (await api.put(`/users/${uid}/location`, location)).data;
export const submitTechnicianReview = async (jobId: string, review: unknown): Promise<unknown> =>
  (await api.post(`/requests/${jobId}/review`, review)).data;
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
    formData.append('profileImage', {
      uri: profile.profileImage.uri,
      name: profile.profileImage.fileName ?? 'profile-image.jpg',
      type: profile.profileImage.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
  }
  return (await api.put(`/profile/${encodeURIComponent(uid)}/profile`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
};
export const forgotPassword = async (data: unknown): Promise<unknown> => (await api.post('/auth/forgot-password', data)).data;
export const resetPassword = async (data: unknown): Promise<unknown> => (await api.post('/auth/reset-password', data)).data;
export const verifyCompletionCode = async (jobId: string, code: string): Promise<unknown> =>
  (await api.post(`/requests/${jobId}/verify-completion`, { code })).data;
export const fetchTechnicianRecommendations = async (jobId: string): Promise<unknown> =>
  (await api.get('/ai/recommend', { params: { jobId } })).data;

export const uploadPortfolioPhotos = async (uid: string, photos: Array<{ uri: string; fileName?: string; name?: string; mimeType?: string; type?: string }>): Promise<unknown> => {
  const formData = new FormData();
  photos.forEach((photo) =>
    formData.append('photos', {
      uri: photo.uri,
      name: photo.fileName ?? photo.name ?? 'portfolio-photo.jpg',
      type: photo.mimeType ?? photo.type ?? 'image/jpeg',
    } as unknown as Blob),
  );
  return (await api.post(`/users/${uid}/portfolio`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
};

export default api;
