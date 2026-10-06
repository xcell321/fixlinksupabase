// Feed data hook for the Available Jobs screen.
// Moved verbatim from AvailableJobsScreen.tsx: feed state, GPS refresh,
// loadJobs with overlap guard + per-technician cache, the silent 8s poll,
// and pull-to-refresh. No behavior change.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { fetchRepairRequests, fetchTechnicianJobs, updateTechnicianLocation } from '../../../services/api';
import type { JobItem } from '../availableJobsHelpers';
import { jobsCache } from './jobsCache';
import type { Coords, TechnicianRef } from './types';

interface UseTechnicianJobsResult {
  jobs: JobItem[];
  acceptedJobs: JobItem[];
  completedJobs: JobItem[];
  loading: boolean;
  refreshing: boolean;
  fetchError: boolean;
  lastSyncAt: Date | null;
  techCoords: Coords | null;
  setJobs: React.Dispatch<React.SetStateAction<JobItem[]>>;
  setAcceptedJobs: React.Dispatch<React.SetStateAction<JobItem[]>>;
  loadJobs: (opts?: { background?: boolean }) => Promise<void>;
  getUpdatedTechCoords: () => Promise<Coords | null>;
  handleRefresh: () => void;
}

export const useTechnicianJobs = (technician: TechnicianRef): UseTechnicianJobsResult => {
  const cached = technician?.uid ? jobsCache.get(technician.uid) : undefined;
  const [jobs, setJobs] = useState<JobItem[]>(cached?.jobs ?? []);
  const [acceptedJobs, setAcceptedJobs] = useState<JobItem[]>(cached?.acceptedJobs ?? []);
  const [completedJobs, setCompletedJobs] = useState<JobItem[]>(cached?.completedJobs ?? []);
  const [loading, setLoading] = useState<boolean>(cached ? false : true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<boolean>(cached?.fetchError ?? false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(cached?.lastSyncAt ?? null);
  const loadJobsRef = useRef<boolean>(false);
  // Fingerprint of the last applied feed. The 8s poll refetches constantly,
  // but re-setting identical arrays re-renders every card and re-resolves
  // every image for no visible change, which reads as lag on web and
  // low-end phones. Identical payloads skip every setter below.
  const lastFingerprintRef = useRef<string>('');

  // Coords state
  const [techCoords, setTechCoords] = useState<Coords | null>(
    technician?.latitude && technician?.longitude
      ? { latitude: Number(technician.latitude), longitude: Number(technician.longitude) }
      : null
  );

  // Stable identity so consumers (memoized cards, pull-to-refresh) do not
  // see a new function every render. Reads stay identical to before.
  const getUpdatedTechCoords = useCallback(async (): Promise<Coords | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        // Same spot as last tick: keep the old object so downstream effects
        // and renders that depend on coords stay quiet.
        setTechCoords((prev) => (
          prev
          && Math.abs(prev.latitude - coords.latitude) < 0.000001
          && Math.abs(prev.longitude - coords.longitude) < 0.000001
            ? prev
            : coords
        ));
        if (technician?.uid) {
          updateTechnicianLocation(technician.uid, coords).catch(() => {});
        }
        return coords;
      }
    } catch (e) {
      console.warn('Could not update technician GPS:', e);
    }
    return techCoords;
  }, [technician?.uid, techCoords]);

  const loadJobs = useCallback(async (opts: { background?: boolean } = {}): Promise<void> => {
    // Skip overlapping ticks. Slow tunnel responses must never stack sockets,
    // which also quiets MaxListeners warnings under many-user load.
    if (loadJobsRef.current) return;
    loadJobsRef.current = true;
    const isBackground = opts.background ?? false;
    if (!isBackground && !(technician?.uid ? jobsCache.has(technician.uid) : false)) {
      setLoading(true);
    }
    try {
      const coordsForFetch = techCoords ?? undefined;
      getUpdatedTechCoords().catch(() => null);
      const [result, assigned] = await Promise.all([
        fetchRepairRequests(technician?.uid, coordsForFetch),
        fetchTechnicianJobs(technician?.uid)
      ]);
      const newJobs = Array.isArray(result) ? (result as JobItem[]) : [];
      const assignedJobs = Array.isArray(assigned) ? (assigned as JobItem[]) : [];
      const newAccepted = assignedJobs.filter((job) =>
        ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'].includes(job.status ?? '')
      );
      // Finished work leaves the active list but stays browsable under History
      // so the technician can still rate the customer afterwards.
      const newCompleted = assignedJobs.filter(
        (job) => String(job.status ?? '').toLowerCase() === 'completed'
      );
      setFetchError(false);
      const now = new Date();
      // Same payload as last tick: leave every list untouched so cards,
      // images, and scroll position sit perfectly still.
      const fingerprint = `${technician?.uid ?? ''}:${JSON.stringify([newJobs, newAccepted, newCompleted])}`;
      if (fingerprint !== lastFingerprintRef.current) {
        lastFingerprintRef.current = fingerprint;
        setJobs(newJobs);
        setAcceptedJobs(newAccepted);
        setCompletedJobs(newCompleted);
        setLastSyncAt(now);
        if (technician?.uid) {
          jobsCache.set(technician.uid, {
            jobs: newJobs,
            acceptedJobs: newAccepted,
            completedJobs: newCompleted,
            lastSyncAt: now,
            fetchError: false
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load technician jobs from backend:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadJobsRef.current = false;
    }
  }, [technician?.uid, techCoords]);

  useEffect(() => {
    loadJobs({ background: technician?.uid ? jobsCache.has(technician.uid) : false });
    // Silent 8s refresh. New customer requests appear without manual reload
    // on tunnel links, LAN, and data. Background mode skips spinners.
    const interval = setInterval(() => loadJobs({ background: true }), 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technician?.uid]);

  const handleRefresh = useCallback((): void => {
    setRefreshing(true);
    loadJobs();
  }, [loadJobs]);

  return {
    jobs,
    acceptedJobs,
    completedJobs,
    loading,
    refreshing,
    fetchError,
    lastSyncAt,
    techCoords,
    setJobs,
    setAcceptedJobs,
    loadJobs,
    getUpdatedTechCoords,
    handleRefresh,
  };
};
