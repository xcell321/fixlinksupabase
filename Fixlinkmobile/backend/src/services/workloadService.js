// Technician Workload & Capacity System (UAT #7).
//
// Two related numbers, both environment-driven so nothing is baked in:
//   - maxActiveJobs: the hard ceiling on simultaneous active jobs. The accept
//     path refuses a new job once the technician is at this number.
//   - busyThreshold / atCapacityThreshold: the softer tiers used for feed
//     ranking and AI recommendations.
//
// ACTIVE = Accepted, Confirmed, Customer Ready, In Progress.

const { supabase } = require('../config/supabase');

// Statuses that count as "active work". Env-driven so ops can change what
// blocks a technician without a deploy.
const DEFAULT_ACTIVE_STATUSES = ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'];
const activeStatuses = () => {
  const raw = process.env.ACTIVE_JOB_STATUSES;
  if (!raw) return DEFAULT_ACTIVE_STATUSES;
  const list = String(raw).split(',').map((status) => status.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ACTIVE_STATUSES;
};

const DEFAULT_MAX_ACTIVE_JOBS = 1;
const DEFAULT_BUSY_THRESHOLD = 3;
const DEFAULT_AT_CAPACITY_THRESHOLD = 6;

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getMaxActiveJobs = () => asInt(process.env.TECHNICIAN_MAX_ACTIVE_JOBS, DEFAULT_MAX_ACTIVE_JOBS);
const getBusyThreshold = () => asInt(process.env.TECHNICIAN_BUSY_JOBS, DEFAULT_BUSY_THRESHOLD);
const getAtCapacityThreshold = () => asInt(process.env.TECHNICIAN_AT_CAPACITY_JOBS, DEFAULT_AT_CAPACITY_THRESHOLD);

// True when the technician already holds the maximum allowed active jobs.
const isAtJobLimit = (count) => (Number(count) || 0) >= getMaxActiveJobs();

const getWorkloadStatus = (count) => {
  const n = Number(count) || 0;
  if (n >= getAtCapacityThreshold()) return 'at_capacity';
  if (n >= getBusyThreshold()) return 'busy';
  return 'available';
};

const getTechnicianActiveJobCount = async (technicianUid) => {
  if (!technicianUid) return 0;
  const { count, error } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('technician_uid', String(technicianUid))
    .in('status', activeStatuses());
  if (error) {
    // Fallback to non-head query if counting not supported
    const { data, error: fallbackError } = await supabase
      .from('jobs')
      .select('id')
      .eq('technician_uid', String(technicianUid))
      .in('status', activeStatuses());
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
    .in('status', activeStatuses());
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
  DEFAULT_ACTIVE_STATUSES,
  activeStatuses,
  getMaxActiveJobs,
  getBusyThreshold,
  getAtCapacityThreshold,
  isAtJobLimit,
  getWorkloadStatus,
  getTechnicianActiveJobCount,
  getActiveJobCountsForTechnicians,
  getTechnicianWorkload,
};
