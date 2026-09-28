// Chat + notification endpoints.
import api, { unwrapError } from './client';
import { appendUploadFile, type PickedFile } from './upload';

export type ChatMessageInput = {
  senderUid: string;
  senderName: string;
  senderRole: string;
  // `text` may be empty when a photo is attached.
  text: string;
  photo?: PickedFile | null;
};

export const fetchJobMessages = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/accepted/${encodeURIComponent(jobId)}/messages`)).data;

// Text-only messages keep the plain JSON path; attaching a photo switches the
// same route to multipart so the file rides along with the sender fields.
export const sendJobMessage = async (jobId: string, messageData: ChatMessageInput): Promise<unknown> => {
  const { photo, ...fields } = messageData;
  const url = `/requests/accepted/${encodeURIComponent(jobId)}/messages`;
  try {
    if (!photo?.uri) {
      return (await api.post(url, fields)).data;
    }
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      formData.append(key, String(value));
    }
    await appendUploadFile(formData, 'photo', photo, 'chat-photo.jpg', 'image/jpeg');
    return (await api.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Photo uploads through a tunnel or slow mobile data need extra time.
      timeout: 120000,
    })).data;
  } catch (error) {
    throw unwrapError(error);
  }
};
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
