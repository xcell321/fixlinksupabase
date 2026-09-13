import axios from 'axios';
import { Platform } from 'react-native';

// IMPORTANT NOTE FOR MOBILE TESTING:
// - If using Android Emulator, use 'http://10.0.2.2:5000'
// - If using iOS Simulator, use 'http://localhost:5000'
// - If using a physical device, use your computer's local network IP address (e.g., 'http://192.168.1.36:5000')
// - Web (browser) uses localhost so the dev server can reach the backend on this machine
const API_BASE_URL = Platform.OS === 'web'
  ? 'http://localhost:5050/api'
  : 'http://192.168.1.36:5050/api';

export { API_BASE_URL };

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

// Repair Requests API calls
export const submitRepairRequest = async (requestData) => {
  try {
    const formData = new FormData();
    Object.entries(requestData).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (key === 'photo' && value.uri) {
          formData.append('photo', {
            uri: value.uri,
            name: value.fileName || 'repair-photo.jpg',
            type: value.mimeType || 'image/jpeg',
          });
        } else {
          formData.append(key, String(value));
        }
      }
    });
    const response = await api.post('/requests', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: 'Network Error' };
  }
};

export const registerUser = async (userData) => {
  const formData = new FormData();
  const getMimeType = (file) => {
    if (file.mimeType) return file.mimeType;
    const extension = file.name?.split('.').pop()?.toLowerCase();
    return extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
  };
  Object.entries(userData).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if ((key === 'governmentIdFile' || key === 'certificateFile') && value.uri) {
        formData.append(key, {
          uri: value.uri,
          name: value.name || 'verification-document',
          type: getMimeType(value),
        });
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

export const fetchRepairRequests = async (technicianUid, coords) => {
  try {
    const params = {};
    if (technicianUid) params.technicianUid = technicianUid;
    if (coords?.latitude && coords?.longitude) {
      params.latitude = coords.latitude;
      params.longitude = coords.longitude;
    }
    const response = await api.get('/requests', { params: Object.keys(params).length ? params : undefined });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: 'Network Error' };
  }
};
export const acceptRepairRequest = async (jobId, technicianUid, technicianName) => (await api.put(`/requests/${encodeURIComponent(jobId)}/accept`, { technicianUid, technicianName })).data;

export const fetchPlatformCategories = async () => (await api.get('/users/platform/categories')).data;
export const fetchAnnouncements = async () => (await api.get('/users/platform/announcements')).data;
export const fetchCompletedJobs = async (customerName) => (await api.get(`/requests/completed/${encodeURIComponent(customerName)}`)).data;
export const fetchCustomerRequests = async (customerName, customerUid) => (await api.get(`/requests/customer/${encodeURIComponent(customerName)}`, {
  params: customerUid ? { customerUid } : undefined,
})).data;
export const fetchTechnicianJobs = async (technicianUid) => (await api.get(`/requests/technician/${encodeURIComponent(technicianUid)}`)).data;
export const fetchJobMessages = async (jobId) => (await api.get(`/requests/accepted/${encodeURIComponent(jobId)}/messages`)).data;
export const sendJobMessage = async (jobId, messageData) => (await api.post(`/requests/accepted/${encodeURIComponent(jobId)}/messages`, messageData)).data;
export const fetchUnreadMessageNotifications = async (uid, role) => (await api.get('/requests/messages/unread', { params: { uid, role } })).data;
export const fetchMessageInbox = async (uid, role) => (await api.get('/requests/messages/inbox', { params: { uid, role } })).data;
export const markJobMessagesRead = async (jobId, viewerUid) => (await api.put(`/requests/accepted/${encodeURIComponent(jobId)}/messages/read`, { viewerUid })).data;
export const declineRepairRequest = async (jobId, technicianUid) => (await api.put(`/requests/${jobId}/decline`, { technicianUid })).data;
export const cancelRepairRequest = async (requestId) => (await api.put(`/requests/${encodeURIComponent(requestId)}/cancel`)).data;
export const updateJobStatus = async (jobId, status, technicianUid) => (await api.put(`/requests/accepted/${jobId}/status`, { status, technicianUid })).data;
export const fetchAcceptedJobLocation = async (jobId) => (await api.get(`/requests/accepted/${jobId}/location`)).data;
export const fetchJobLiveTracking = async (jobId) => (await api.get(`/requests/accepted/${jobId}/live-tracking`)).data;
export const updateCustomerLocation = async (jobId, customerUid, location) => (await api.put(`/requests/accepted/${jobId}/customer-location`, { customerUid, ...location })).data;
export const updateTechnicianLocation = async (uid, location) => (await api.put(`/users/${uid}/location`, location)).data;
export const submitTechnicianReview = async (jobId, review) => (await api.post(`/requests/${jobId}/review`, review)).data;
export const fetchTechnicianProfile = async (uid) => (await api.get(`/users/${uid}/profile`)).data;
export const updateTechnicianProfile = async (uid, profile) => (await api.put(`/profile/${encodeURIComponent(uid)}/technician`, profile)).data;
export const updateCustomerProfile = async (uid, profile) => {
  const formData = new FormData();
  formData.append('name', profile.name || '');
  formData.append('phone', profile.phone || '');
  formData.append('address', profile.address || '');
  if (profile.profileImage?.uri) {
    formData.append('profileImage', {
      uri: profile.profileImage.uri,
      name: profile.profileImage.fileName || 'profile-image.jpg',
      type: profile.profileImage.mimeType || 'image/jpeg',
    });
  }
  return (await api.put(`/profile/${encodeURIComponent(uid)}/profile`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })).data;
};
export const forgotPassword = async (data) => (await api.post('/auth/forgot-password', data)).data;
export const resetPassword = async (data) => (await api.post('/auth/reset-password', data)).data;
export const verifyCompletionCode = async (jobId, code) => (await api.post(`/requests/${jobId}/verify-completion`, { code })).data;

// AI-assisted recommendation (Requirement 1 & 2)
export const fetchTechnicianRecommendations = async (jobId) => (await api.get('/ai/recommend', { params: { jobId } })).data;


export const uploadPortfolioPhotos = async (uid, photos) => {
  const formData = new FormData();
  photos.forEach((photo) => formData.append('photos', {
    uri: photo.uri,
    name: photo.fileName || photo.name || 'portfolio-photo.jpg',
    type: photo.mimeType || photo.type || 'image/jpeg',
  }));
  return (await api.post(`/users/${uid}/portfolio`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
};

export default api;