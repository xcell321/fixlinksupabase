// Chat + notification endpoints.
import api from './client';

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
export const fetchMessageInbox = async (uid: string, role: string): Promise<unknown> =>
  (await api.get('/requests/messages/inbox', { params: { uid, role } })).data;
export const markJobMessagesRead = async (jobId: string, viewerUid: string): Promise<unknown> =>
  (await api.put(`/requests/accepted/${encodeURIComponent(jobId)}/messages/read`, { viewerUid })).data;
