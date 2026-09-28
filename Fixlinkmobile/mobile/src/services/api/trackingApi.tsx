// Live-tracking + location endpoints.
import api from './client';

export const fetchAcceptedJobLocation = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/accepted/${jobId}/location`)).data;
export const fetchJobLiveTracking = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/accepted/${jobId}/live-tracking`)).data;
export const updateCustomerLocation = async (jobId: string, customerUid: string, location: Record<string, unknown>): Promise<unknown> =>
  (await api.put(`/requests/accepted/${jobId}/customer-location`, { customerUid, ...location })).data;
export const updateTechnicianLocation = async (uid: string, location: Record<string, unknown>): Promise<unknown> =>
  (await api.put(`/users/${uid}/location`, location)).data;
