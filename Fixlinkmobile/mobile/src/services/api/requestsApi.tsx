// Repair-request / job endpoints: submit, feeds, lifecycle, completion, reviews.
import api, { unwrapError } from './client';
import { buildUploadFile, type Coords } from './upload';

export const submitRepairRequest = async (requestData: Record<string, unknown>): Promise<unknown> => {
  try {
    const formData = new FormData();
    for (const [key, value] of Object.entries(requestData)) {
      if (value !== undefined && value !== null && value !== '') {
        const v = value as { uri?: string };
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
    throw unwrapError(error);
  }
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
    throw unwrapError(error);
  }
};

export const acceptRepairRequest = async (jobId: string, technicianUid: string, technicianName: string): Promise<unknown> => {
  try {
    return (await api.put(`/requests/${encodeURIComponent(jobId)}/accept`, { technicianUid, technicianName })).data;
  } catch (error: unknown) {
    throw unwrapError(error);
  }
};

export const declineRepairRequest = async (jobId: string, technicianUid: string): Promise<unknown> =>
  (await api.put(`/requests/${jobId}/decline`, { technicianUid })).data;

export const cancelRepairRequest = async (requestId: string, cancellationReason: string): Promise<unknown> =>
  (await api.put(`/requests/${encodeURIComponent(requestId)}/cancel`, { cancellationReason })).data;

export const fetchCustomerRequests = async (customerName: string, customerUid?: string): Promise<unknown> =>
  (await api.get(`/requests/customer/${encodeURIComponent(customerName)}`, { params: customerUid ? { customerUid } : undefined })).data;

export const fetchCompletedJobs = async (customerName: string, customerUid?: string): Promise<unknown> =>
  (await api.get(`/requests/completed/${encodeURIComponent(customerName)}`, { params: customerUid ? { customerUid } : undefined })).data;

export const fetchTechnicianJobs = async (technicianUid: string): Promise<unknown> =>
  (await api.get(`/requests/technician/${encodeURIComponent(technicianUid)}`)).data;

export const fetchTechnicianWorkload = async (technicianUid: string): Promise<unknown> =>
  (await api.get(`/requests/technician/${encodeURIComponent(technicianUid)}/workload`)).data;

export const fetchJobById = async (jobId: string): Promise<unknown> =>
  (await api.get(`/requests/job/${encodeURIComponent(jobId)}`)).data;

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

export const rateCustomer = async (
  jobId: string,
  technicianUid: string,
  rating: number,
  comment?: string,
): Promise<unknown> =>
  (
    await api.post(`/requests/${encodeURIComponent(jobId)}/rate-customer`, {
      technicianUid,
      rating,
      comment,
    })
  ).data;

export const reportScam = async (jobId: string, reason: string): Promise<unknown> => {
  try {
    return (await api.post(`/requests/${encodeURIComponent(jobId)}/report-scam`, { reason })).data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : error;
  }
};

export interface CustomerReviewItem {
  rating: number;
  comment: string;
  createdAt: string | null;
}

// UAT #11: reviews technicians wrote about a customer, newest first.
export const fetchCustomerReviews = async (customerUid: string): Promise<CustomerReviewItem[]> => {
  const data = (await api.get(`/requests/customer/${encodeURIComponent(customerUid)}/reviews`)).data as {
    reviews?: CustomerReviewItem[];
  };
  return Array.isArray(data?.reviews) ? data.reviews : [];
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

export const verifyCompletionCode = async (jobId: string, code: string): Promise<unknown> => {
  try {
    return (await api.post(`/requests/${jobId}/verify-completion`, { code })).data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown } };
    throw err.response ? err.response.data : error;
  }
};

export const submitTechnicianReview = async (jobId: string, review: unknown): Promise<unknown> =>
  (await api.post(`/requests/${jobId}/review`, review)).data;
