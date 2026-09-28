// Shared customer job-list fetching. Dashboard, RequestProgress and
// CustomerProfile previously each called fetchCompletedJobs +
// fetchCustomerRequests as an inline pair.
import { useCallback, useState } from 'react';
import { fetchCompletedJobs, fetchCustomerRequests } from '../services/api';

type JobRow = Record<string, unknown>;

export const useCustomerRequests = (customerName: string, customerUid: string) => {
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([]);
  const [completedJobs, setCompletedJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!customerName || !customerUid) return;
    setLoading(true);
    try {
      const [active, completed] = await Promise.all([
        fetchCustomerRequests(customerName, customerUid),
        fetchCompletedJobs(customerName, customerUid),
      ]);
      setActiveJobs(Array.isArray(active) ? (active as JobRow[]) : []);
      setCompletedJobs(Array.isArray(completed) ? (completed as JobRow[]) : []);
    } finally {
      setLoading(false);
    }
  }, [customerName, customerUid]);

  return { activeJobs, completedJobs, loading, fetchAll };
};
