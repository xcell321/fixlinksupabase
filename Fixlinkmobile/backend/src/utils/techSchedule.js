// Shared technician schedule/availability helper for customer-facing
// schedule visibility. DISPLAY ONLY: safe fields, no customer PII, no GPS.
// Same-calendar-day rule: FixLink has no service-duration or travel-buffer
// system, so a technician counts as busy on any day with an occupied job.
const { supabase } = require('../config/supabase');

const OCCUPIED_STATUSES = ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'];

const SAFE_SCHEDULE_COLUMNS = 'preferred_date,preferred_time,scheduled_date,appliance_type,category,status';

const serializeScheduleItem = (row) => ({
  preferredDate: row.preferred_date || null,
  preferredTime: row.preferred_time || null,
  scheduledDate: row.scheduled_date || null,
  applianceType: row.appliance_type || 'Repair Job',
  category: row.category || null,
  status: row.status,
});

// Calendar-day key for same-day comparison. Prefers machine-reliable
// scheduled_date (ISO); falls back to parsing the preferred_date display
// string ("Sep 20, 2026") component-wise so server timezone can never
// shift the day. Returns null when neither yields a valid day.
const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const dayKeyFromDisplay = (display) => {
  const match = String(display || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${String(match[2]).padStart(2, '0')}`;
};

const dayKeyOf = (item) => {
  const iso = item?.scheduledDate || item?.scheduled_date || null;
  if (iso) {
    const time = new Date(iso).getTime();
    if (!Number.isNaN(time)) return new Date(iso).toISOString().slice(0, 10);
  }
  return dayKeyFromDisplay(item?.preferredDate || item?.preferred_date || null);
};

// Safe upcoming/commitment schedule for one technician. Explicit safe-column
// select: never the full job row, never customer data, never GPS.
const getTechnicianSchedule = async (technicianUid) => {
  const { data, error } = await supabase
    .from('jobs')
    .select(SAFE_SCHEDULE_COLUMNS)
    .eq('technician_uid', technicianUid)
    .in('status', OCCUPIED_STATUSES)
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map(serializeScheduleItem);
};

// Batch variant for AI recommendation lists: one query for all technicians,
// no N+1. Returns a Map of technicianUid -> safe schedule items.
const getSchedulesForTechnicians = async (technicianUids) => {
  const uids = [...new Set((technicianUids || []).map(String).filter(Boolean))];
  const byUid = new Map(uids.map((uid) => [uid, []]));
  if (uids.length === 0) return byUid;
  const { data, error } = await supabase
    .from('jobs')
    .select(`technician_uid,${SAFE_SCHEDULE_COLUMNS}`)
    .in('technician_uid', uids)
    .in('status', OCCUPIED_STATUSES)
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) throw error;
  (data || []).forEach((row) => {
    const key = String(row.technician_uid);
    if (byUid.has(key) && (byUid.get(key) || []).length < 10) {
      byUid.get(key).push(serializeScheduleItem(row));
    }
  });
  return byUid;
};

// 'busy' when any occupied job shares the requested calendar day.
const availabilityForDay = (requestDayKey, scheduleItems) => {
  if (!requestDayKey) return 'available';
  return (scheduleItems || []).some((item) => dayKeyOf(item) === requestDayKey) ? 'busy' : 'available';
};

module.exports = {
  OCCUPIED_STATUSES,
  getTechnicianSchedule,
  getSchedulesForTechnicians,
  dayKeyOf,
  availabilityForDay,
};
