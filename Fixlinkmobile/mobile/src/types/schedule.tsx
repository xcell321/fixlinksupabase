// Customer-safe technician schedule types. Mirrors the backend safe
// serializer: date/time/appliance/category/status only, never customer PII.
export type ScheduleAvailability = 'available' | 'busy';

export interface TechnicianScheduleItem {
  preferredDate?: string | null;
  preferredTime?: string | null;
  scheduledDate?: string | null;
  applianceType: string;
  category?: string | null;
  status: string;
}

export interface TechnicianScheduleResponse {
  technicianUid: string;
  availability: ScheduleAvailability;
  jobs: TechnicianScheduleItem[];
}
