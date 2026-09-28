// Shared axios client + auth token. Imported by every api/* endpoint module.
import axios from 'axios';
import { API_BASE_URL } from './apiUrls';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
});

export const setAuthToken = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const unwrapError = (error: unknown): unknown => {
  const err = error as { response?: { data?: unknown } };
  return err.response ? err.response.data : { error: 'Network Error' };
};

export default api;
