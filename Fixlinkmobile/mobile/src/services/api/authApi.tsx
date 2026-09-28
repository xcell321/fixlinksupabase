// Auth endpoints: register, password recovery.
import api from './client';
import { buildUploadFile, getMimeType } from './upload';

export const registerUser = async (userData: Record<string, unknown>): Promise<unknown> => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(userData)) {
    if (value !== undefined && value !== null && value !== '') {
      const v = value as { uri?: string; mimeType?: string; name?: string };
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

export const forgotPassword = async (data: unknown): Promise<unknown> => (await api.post('/auth/forgot-password', data)).data;
export const resetPassword = async (data: unknown): Promise<unknown> => (await api.post('/auth/reset-password', data)).data;
