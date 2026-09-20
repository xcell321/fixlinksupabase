// Technician Workload & Capacity System
// ACTIVE = Accepted, Confirmed, Customer Ready, In Progress
// 0-2 available, 3-5 busy (still eligible), 6+ at_capacity (excluded from AI)
const { supabase } = require('../config/supabase');

const ACTIVE_STATUSES = ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'];

const getWorkloadStatus = (count) => {
  const n = Number(count) || 0;
  if (n >= 6) return 'at_capacity';
  if (n >= 3) return 'busy';
  return 'available';
};

const getTechnicianActiveJobCount = async (technicianUid) => {
  if (!technicianUid) return 0;
  const { count, error } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('technician_uid', String(technicianUid))
    .in('status', ACTIVE_STATUSES);
  if (error) {
    // Fallback to non-head query if counting not supported
    const { data, error: fallbackError } = await supabase
      .from('jobs')
      .select('id')
      .eq('technician_uid', String(technicianUid))
      .in('status', ACTIVE_STATUSES);
    if (fallbackError) {
      console.warn('Workload count fallback failed:', fallbackError.message);
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  }
  return Number(count) || 0;
};

const getActiveJobCountsForTechnicians = async (technicianUids) => {
  const uids = [...new Set((technicianUids || []).map(String).filter(Boolean))];
  const byUid = new Map(uids.map((uid) => [uid, 0]));
  if (uids.length === 0) return byUid;
  const { data, error } = await supabase
    .from('jobs')
    .select('technician_uid')
    .in('technician_uid', uids)
    .in('status', ACTIVE_STATUSES);
  if (error) {
    console.warn('Batch workload count failed:', error.message);
    return byUid;
  }
  (data || []).forEach((row) => {
    const key = String(row.technician_uid);
    if (byUid.has(key)) byUid.set(key, (byUid.get(key) || 0) + 1);
  });
  return byUid;
};

const getTechnicianWorkload = async (technicianUid) => {
  const activeJobs = await getTechnicianActiveJobCount(technicianUid);
  return { activeJobs, workloadStatus: getWorkloadStatus(activeJobs) };
};

module.exports = {
  ACTIVE_STATUSES,
  getWorkloadStatus,
  getTechnicianActiveJobCount,
  getActiveJobCountsForTechnicians,
  getTechnicianWorkload,
};
