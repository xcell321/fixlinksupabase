// Job action handlers for the Available Jobs screen.
// Moved verbatim from AvailableJobsScreen.tsx: accept/decline with confirm
// modals, arrival/start, no-show reporting, and the OTP verify handshake.
// All Alert copy, optimistic updates and error mapping are unchanged.
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import {
  acceptRepairRequest,
  declineRepairRequest,
  recordTechnicianArrival,
  reportNoShow,
  updateJobStatus,
  verifyCompletionCode,
} from '../../../services/api';
import { validateOtpCode, noShowState, type JobItem } from '../availableJobsHelpers';
import { noShowBlockedText } from '../../../utils/noShowPolicy';
import type { TechnicianRef } from './types';

interface UseJobActionsArgs {
  technician: TechnicianRef;
  workloadStatus: string;
  setJobs: React.Dispatch<React.SetStateAction<JobItem[]>>;
  setAcceptedJobs: React.Dispatch<React.SetStateAction<JobItem[]>>;
  loadJobs: (opts?: { background?: boolean }) => Promise<void>;
  setSelectedJobForDetails: React.Dispatch<React.SetStateAction<JobItem | null>>;
  selectedJobForDetails: JobItem | null;
  setFeedTab: React.Dispatch<React.SetStateAction<'queue' | 'active' | 'completed'>>;
}

export const useJobActions = ({
  technician,
  workloadStatus,
  setJobs,
  setAcceptedJobs,
  loadJobs,
  setSelectedJobForDetails,
  selectedJobForDetails,
  setFeedTab,
}: UseJobActionsArgs) => {
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [confirmJob, setConfirmJob] = useState<JobItem | null>(null);
  const [dismissJob, setDismissJob] = useState<JobItem | null>(null);
  const [dismissing, setDismissing] = useState<boolean>(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // OTP Verification Modal State
  const [otpModalVisible, setOtpModalVisible] = useState<boolean>(false);
  const [selectedJobForOtp, setSelectedJobForOtp] = useState<JobItem | null>(null);
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);

  const [noShowJob, setNoShowJob] = useState<JobItem | null>(null);

  // Floating success modals. Alert dialogs do not fire reliably on web,
  // so accept/start/complete confirmations render in-app instead.
  const [acceptedNotice, setAcceptedNotice] = useState<boolean>(false);
  const [startedNotice, setStartedNotice] = useState<boolean>(false);
  const [completedNotice, setCompletedNotice] = useState<boolean>(false);

  // Stable identity so the memoized job cards skip re-renders when
  // unrelated screen state changes. Logic is unchanged.
  const handleAcceptJob = useCallback((job: JobItem): void => {
    if (!technician?.uid) {
      setAcceptError('Please sign in with a verified technician account.');
      return;
    }
    if (acceptingJobId) return;

    if (workloadStatus === 'at_capacity') {
      setAcceptError('You currently have 6 active jobs. Please complete an ongoing repair before accepting more requests.');
      return;
    }

    // In-app confirm modal. Alert buttons do not fire reliably on web,
    // which left taps doing nothing with no message shown.
    setAcceptError(null);
    setConfirmJob(job);
  }, [technician?.uid, acceptingJobId, workloadStatus]);

  const doAcceptJob = async (): Promise<void> => {
    const job = confirmJob;
    if (!job || !technician?.uid || acceptingJobId) return;
    setConfirmJob(null);
    setAcceptingJobId(job.id);
    try {
      const response = (await acceptRepairRequest(
        job.id,
        technician.uid,
        technician.name || 'Technician'
      )) as { jobId?: string; message?: string };

      const acceptedJobId = response?.jobId || job.id;

      setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
      setAcceptedJobs((currentJobs) => [
        {
          ...job,
          id: acceptedJobId,
          status: 'Accepted',
          technicianUid: technician.uid,
          technicianName: technician.name
        },
        ...currentJobs
      ]);
      setSelectedJobForDetails(null);
      setFeedTab('active');
      setAcceptError(null);
      setAcceptedNotice(true);
      loadJobs({ background: true });
    } catch (error) {
      const err = error as { code?: string; message?: string; error?: string };
      // Raw transport codes never reach the technician: anything shaped like
      // "status code 409" becomes the friendly capacity sentence instead.
      const rawMessage = err?.code === 'TECHNICIAN_AT_CAPACITY'
        ? err?.message || 'Complete an active job to accept new work.'
        : err?.error || err?.message || 'This job may already have been claimed by another technician.';
      setAcceptError(
        /status code \d{3}/i.test(rawMessage)
          ? 'You cannot accept this job right now. Finish your accepted jobs first, then try again.'
          : rawMessage
      );
    } finally {
      setAcceptingJobId(null);
    }
  };

  const handleDeclineJob = useCallback((job: JobItem): void => {
    if (!technician?.uid) return;
    setAcceptError(null);
    setDismissJob(job);
  }, [technician?.uid]);

  const doDismissJob = async (): Promise<void> => {
    const job = dismissJob;
    if (!job || !technician?.uid || dismissing) return;
    setDismissJob(null);
    setDismissing(true);
    try {
      await declineRepairRequest(job.id, technician.uid);
      setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
      if (selectedJobForDetails?.id === job.id) {
        setSelectedJobForDetails(null);
      }
      setAcceptError(null);
    } catch (error) {
      const err = error as { error?: string; message?: string };
      setAcceptError(err?.error || err?.message || 'Failed to dismiss job.');
    } finally {
      setDismissing(false);
    }
  };

  const handleArrival = useCallback(async (job: JobItem): Promise<void> => {
    if (!technician?.uid) return;
    setActionLoadingId(job.id);
    try {
      await recordTechnicianArrival(job.id, technician.uid);
      setAcceptedJobs((currentJobs) =>
        currentJobs.map((j) =>
          j.id === job.id
            ? { ...j, technicianArrivalAt: new Date().toISOString() }
            : j
        )
      );
      Alert.alert('Arrival Confirmed', 'The customer has been notified of your physical arrival.');
      loadJobs({ background: true });
    } catch (error) {
      const err = error as {
        response?: { data?: { error?: string; message?: string } };
        error?: string;
        message?: string;
      };
      const errorMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.error ||
        err?.message ||
        'Please try again.';
      Alert.alert('Unable to record arrival', errorMessage);
    } finally {
      setActionLoadingId(null);
    }
  }, [technician?.uid, loadJobs]);

  const handleStartJob = useCallback(async (job: JobItem): Promise<void> => {
    if (!technician?.uid) return;
    setActionLoadingId(job.id);
    try {
      await updateJobStatus(job.id, 'In Progress', technician.uid);
      setAcceptedJobs((currentJobs) =>
        currentJobs.map((j) => (j.id === job.id ? { ...j, status: 'In Progress' } : j))
      );
      setStartedNotice(true);
      loadJobs({ background: true });
    } catch (error) {
      const err = error as {
        response?: { data?: { error?: string; message?: string } };
        error?: string;
        message?: string;
      };
      const errorMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.error ||
        err?.message ||
        'Failed to update job status.';
      Alert.alert('Error', errorMessage);
    } finally {
      setActionLoadingId(null);
    }
  }, [technician?.uid, loadJobs]);

  // UAT #2: the no-show report is only accepted once the technician has
  // recorded an arrival and waited the window, so the action reports the
  // countdown instead of opening a dialog the server would reject.
  const noShowGateMessage = (job: JobItem): string | null => {
    const wait = noShowState(job);
    if (!wait.hasArrived) {
      return 'Record your arrival at the service location before reporting a no-show.';
    }
    if (!wait.ready) return noShowBlockedText(wait);
    return null;
  };

  const handleNoShow = useCallback((job: JobItem): void => {
    if (!technician?.uid) return;
    const blocked = noShowGateMessage(job);
    if (blocked) {
      Alert.alert('Keep waiting', blocked);
      return;
    }
    setAcceptError(null);
    setNoShowJob(job);
  }, [technician?.uid]);

  const doNoShow = async (): Promise<void> => {
    const job = noShowJob;
    if (!job || !technician?.uid || actionLoadingId) return;
    // Re-checked here because the card that opened the dialog may be stale.
    const blocked = noShowGateMessage(job);
    if (blocked) {
      setNoShowJob(null);
      Alert.alert('Keep waiting', blocked);
      return;
    }
    setNoShowJob(null);
    setActionLoadingId(job.id);
    try {
      await reportNoShow(job.id, technician.uid, 'No one available at service location');
      setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== job.id));
      setAcceptError(null);
      loadJobs();
    } catch (error) {
      const err = error as {
        response?: { data?: { error?: string; message?: string } };
        error?: string;
        message?: string;
      };
      setAcceptError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.error ||
        err?.message ||
        'Please try again.'
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const openOtpModal = useCallback((job: JobItem): void => {
    setSelectedJobForOtp(job);
    setOtpCode('');
    setOtpError(null);
    setOtpModalVisible(true);
  }, []);

  // Typing clears the last failure so the message never outlives the attempt.
  const handleOtpCodeChange = (code: string): void => {
    setOtpCode(code);
    if (otpError) {
      setOtpError(null);
    }
  };

  const handleVerifyOtp = async (): Promise<void> => {
    const cleanCode = otpCode.trim();
    if (!validateOtpCode(cleanCode)) {
      setOtpError('Enter all 4 digits before verifying.');
      return;
    }
    if (!selectedJobForOtp) return;

    setVerifyingOtp(true);
    setOtpError(null);
    try {
      await verifyCompletionCode(selectedJobForOtp.id, cleanCode);
      setOtpModalVisible(false);
      setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== selectedJobForOtp.id));
      setCompletedNotice(true);
      loadJobs();
    } catch (error) {
      const err = error as { error?: string; message?: string };
      // Inline instead of an alert: the sheet stays open so the code can be
      // retyped, and the field is cleared so all 4 digits can go in again.
      // Raw transport codes never reach the technician: anything shaped like
      // "status code 404" becomes the friendly retry message instead.
      const rawMessage = err?.error || err?.message || '';
      setOtpError(
        /status code \d{3}/i.test(rawMessage)
          ? 'That code did not match. Ask the customer to read their 4-digit code again.'
          : rawMessage ||
            'That code did not match. Ask the customer to read their 4-digit code again.'
      );
      setOtpCode('');
    } finally {
      setVerifyingOtp(false);
    }
  };

  return {
    acceptingJobId,
    confirmJob,
    setConfirmJob,
    dismissJob,
    setDismissJob,
    dismissing,
    acceptError,
    actionLoadingId,
    noShowJob,
    setNoShowJob,
    acceptedNotice,
    setAcceptedNotice,
    startedNotice,
    setStartedNotice,
    completedNotice,
    setCompletedNotice,
    otpModalVisible,
    setOtpModalVisible,
    otpCode,
    setOtpCode,
    otpError,
    verifyingOtp,
    handleAcceptJob,
    doAcceptJob,
    handleDeclineJob,
    doDismissJob,
    handleArrival,
    handleStartJob,
    handleNoShow,
    doNoShow,
    openOtpModal,
    handleVerifyOtp,
    handleOtpCodeChange,
  };
};
