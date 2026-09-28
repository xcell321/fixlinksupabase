import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// API URL auto-detection. No manual .env editing is needed.
// The Metro dev server (metro.config.js) proxies /api plus /uploads to the
// backend (port 5050), so the app calls its OWN origin:
//
//   Web (browser):     same origin the page loads from
//                      (localhost:8081 or tunnel URL)
//   Native (Expo Go):  the host that serves the JS bundle
//                      (LAN IP or tunnel host)
//
// Manual override (highest priority): set EXPO_PUBLIC_API_URL in mobile/.env
// for example EXPO_PUBLIC_API_URL=https://my-backend.example.com/api
// ---------------------------------------------------------------------------
const envApiUrl = process.env.EXPO_PUBLIC_API_URL;

const readHostUri = (): string => {
  const config = (Constants.expoConfig ?? {}) as {
    hostUri?: string;
    extra?: { hostUri?: string };
  };
  const manifest = (Constants as unknown as {
    manifest?: { hostUri?: string; debuggerHost?: string };
    manifest2?: { extra?: { expoGo?: { developer?: { host?: string } } } };
  }).manifest;
  const manifest2 = (Constants as unknown as {
    manifest2?: { extra?: { expoGo?: { developer?: { projectRoot?: string; host?: string } } } };
  }).manifest2;
  return String(
    config.hostUri ??
      config.extra?.hostUri ??
      manifest?.hostUri ??
      manifest?.debuggerHost ??
      manifest2?.extra?.expoGo?.developer?.host ??
      '',
  );
};

const stripScheme = (value: string): string => {
  const noScheme = String(value ?? '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const noPath = String(noScheme.split('/')[0] ?? noScheme);
  const noQuery = String(noPath.split('?')[0] ?? noPath);
  return noQuery.trim();
};

const isTunnelHost = (host: string): boolean =>
  /(trycloudflare\.com|cfargotunnel\.com|ngrok\.io|ngrok-free\.app|ngrok\.app|loca\.lt|serveo\.net)$/i.test(
    String(host ?? '').trim(),
  );

const isLoopbackHost = (host: string): boolean => {
  const normalized = String(host ?? '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
};

const resolveNativeApiUrl = (): string => {
  const rawHostUri = stripScheme(readHostUri());
  const [rawHost, rawPort] = rawHostUri.split(':');
  const bundleHost = String(rawHost ?? '').trim() || 'localhost';
  const bundlePort = String(rawPort ?? '').trim();

  if (isTunnelHost(bundleHost)) {
    return `https://${bundleHost}/api`;
  }

  if (isLoopbackHost(bundleHost)) {
    const port = /^\d+$/.test(bundlePort) ? bundlePort : '8081';
    if (Platform.OS === 'android') {
      return `http://10.0.2.2:${port}/api`;
    }
    return `http://${bundleHost}:${port}/api`;
  }

  const port = /^\d+$/.test(bundlePort) ? bundlePort : '8081';
  return `http://${bundleHost}:${port}/api`;
};

const resolveWebApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api`;
  }
  return resolveNativeApiUrl();
};

export const API_BASE_URL: string =
  envApiUrl && envApiUrl.trim() !== '' ? envApiUrl.trim().replace(/\/$/, '') : Platform.OS === 'web' ? resolveWebApiUrl() : resolveNativeApiUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
});

export const getApiBaseUrl = (): string => API_BASE_URL;

export const setAuthToken = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

type Coords = { latitude?: number; longitude?: number };

type PickedFile = {
  uri?: string;
  file?: unknown;
  name?: string;
  fileName?: string;
  mimeType?: string;
  type?: string;
};

// Builds the file value appended to FormData on every platform.
// Native uses the { uri, name, type } shape handled by the networking layer.
// Web needs a real File or Blob, so a blob or data URI is fetched first and
// wrapped as a File. Without this the browser sends the text "[object Object]",
// the backend receives no file, and register wrongly reports missing files
// even though the user attached them.
const buildUploadFile = async (
  info: PickedFile,
  fallbackName: string,
  fallbackType: string,
): Promise<Blob | { uri: string; name: string; type: string }> => {
  const name = info.fileName ?? info.name ?? fallbackName;
  const type = info.mimeType ?? info.type ?? fallbackType;
  if (info.file instanceof Blob) {
    return new File([info.file], name, { type });
  }
  if (Platform.OS === 'web' && info.uri && /^(blob:|data:)/i.test(info.uri)) {
    const blob = await (await fetch(info.uri)).blob();
    return new File([blob], name, { type: blob.type || type });
  }
  return { uri: String(info.uri ?? ''), name, type };
};

export const submitRepairRequest = async (requestData: Record<string, unknown>): Promise<unknown> => {
  try {
    const formData = new FormData();
    for (const [key, value] of Object.entries(requestData)) {
      if (value !== undefined && value !== null && value !== '') {
        const v = value as PickedFile;
        if (key === 'photo' && v.uri) {
          formData.append('photo', (await buildUploadFile(v, 'repair-photo.jpg', 'image/jpeg')) as unknown as Blob);
        } else {
          formData.append(key, String(value));
        }
      }
    }
    const response = await api.post('/requests', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Photo uploads through a tunnel or slow mobile data need extra time.
      timeout: 120000,
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
  for (const [key, value] of Object.entries(userData)) {
    if (value !== undefined && value !== null && value !== '') {
      const v = value as PickedFile;
      if ((key === 'governmentIdFile' || key === 'certificateFile') && v.uri) {
        formData.append(
          key,
          (await buildUploadFile(v, 'verification-document', getMimeType(v))) as unknown as Blob,
        );
      } else {
        formData.append(key, String(value));
      }
    }
  }
  const response = await api.post('/auth/register', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Technician registration uploads two documents plus server-side storage
    // writes, so it needs far more time than a plain JSON call, mostly when
    // running through a tunnel. Without this the request aborts at 20s while
    // the backend keeps working, which leaves the app spinning with no result.
    timeout: 120000,
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
    formData.append(
      'profileImage',
      (await buildUploadFile(profile.profileImage, 'profile-image.jpg', 'image/jpeg')) as unknown as Blob,
    );
  }
  return (await api.put(`/profile/${encodeURIComponent(uid)}/profile`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })).data;
};
export const forgotPassword = async (data: unknown): Promise<unknown> => (await api.post('/auth/forgot-password', data)).data;
export const resetPassword = async (data: unknown): Promise<unknown> => (await api.post('/auth/reset-password', data)).data;
export const verifyCompletionCode = async (jobId: string, code: string): Promise<unknown> =>
  (await api.post(`/requests/${jobId}/verify-completion`, { code })).data;
export const fetchTechnicianRecommendations = async (jobId: string): Promise<unknown> =>
  (await api.get('/ai/recommend', { params: { jobId } })).data;
export const askAssistant = async (message: string, context?: unknown): Promise<{ reply?: string; error?: string }> =>
  (await api.post('/ai/assistant', { message, context })).data;

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

export default api;
