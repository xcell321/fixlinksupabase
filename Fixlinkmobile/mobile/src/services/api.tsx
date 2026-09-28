// services/api barrel — preserves `from '../services/api'` imports.
// Endpoints now live in focused modules under services/api/:
//   apiUrls.tsx   base-URL auto-detection
//   client.tsx    axios instance + setAuthToken
//   upload.tsx    multipart helpers (buildUploadFile, getMimeType)
//   authApi.tsx       register, forgot/reset password
//   requestsApi.tsx   repair requests, lifecycle, completion, reviews
//   messagesApi.tsx   chat threads, inbox, notifications
//   trackingApi.tsx   live tracking + GPS updates
//   profileApi.tsx    platform catalog, profiles, portfolio
//   aiApi.tsx         assistant + recommendations

export { API_BASE_URL, getApiBaseUrl } from './api/apiUrls';
export { setAuthToken, default } from './api/client';
export type { Coords, PickedFile } from './api/upload';
export { registerUser, checkTechnicianStatus, forgotPassword, resetPassword } from './api/authApi';
export {
  submitRepairRequest,
  fetchRepairRequests,
  acceptRepairRequest,
  declineRepairRequest,
  cancelRepairRequest,
  fetchCustomerRequests,
  fetchCompletedJobs,
  fetchTechnicianJobs,
  fetchTechnicianWorkload,
  fetchJobById,
  updateJobStatus,
  confirmRepairRequest,
  markCustomerReady,
  recordTechnicianArrival,
  reportNoShow,
  verifyCompletionCode,
  submitTechnicianReview,
} from './api/requestsApi';
export {
  fetchJobMessages,
  sendJobMessage,
  fetchUnreadMessageNotifications,
  fetchNotifications,
  markNotificationRead,
  fetchMessageInbox,
  markJobMessagesRead,
} from './api/messagesApi';
export {
  fetchAcceptedJobLocation,
  fetchJobLiveTracking,
  updateCustomerLocation,
  updateTechnicianLocation,
} from './api/trackingApi';
export {
  fetchPlatformCategories,
  fetchAnnouncements,
  fetchTechnicianProfile,
  fetchTechnicianSchedule,
  updateTechnicianProfile,
  updateCustomerProfile,
  uploadPortfolioPhoto,
} from './api/profileApi';
export { fetchTechnicianRecommendations, askAssistant } from './api/aiApi';
