import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Every branch below returns a real Ionicons glyph name, so the return type is
// the icon set's own union rather than `string`. Callers can therefore drop the
// result straight into `<Ionicons name={...} />` without a cast.
export type IconName = ComponentProps<typeof Ionicons>['name'];

export const getApplianceIcon = (type: string = ''): IconName => {
  const t = String(type).toLowerCase();
  if (t.includes('refrigerator') || t.includes('fridge') || t.includes('freezer')) return 'snow';
  if (t.includes('washing') || t.includes('laundry')) return 'water';
  if (t.includes('air') || t.includes('cooling') || t.includes('aircon')) return 'snow';
  if (t.includes('phone') || t.includes('mobile')) return 'phone-portrait';
  if (t.includes('tv') || t.includes('television') || t.includes('entertainment')) return 'tv';
  if (t.includes('computer') || t.includes('laptop') || t.includes('desktop') || t.includes('printer')) return 'laptop';
  if (t.includes('cctv') || t.includes('camera') || t.includes('security') || t.includes('surveillance')) return 'videocam';
  if (t.includes('network') || t.includes('internet') || t.includes('wifi') || t.includes('modem') || t.includes('router')) return 'wifi';
  if (t.includes('cook') || t.includes('rice') || t.includes('oven') || t.includes('microwave') || t.includes('kettle') || t.includes('blender')) return 'restaurant';
  if (t.includes('office') || t.includes('business')) return 'briefcase';
  if (t.includes('beauty') || t.includes('personal')) return 'sparkles';
  return 'construct';
};

export const getStatusColor = (status: unknown): string => {
  switch (String(status ?? '').toLowerCase()) {
    case 'completed':
      return colors.green;
    case 'in progress':
      return colors.tech;
    case 'customer ready':
      return colors.signalViolet;
    case 'confirmed':
      return colors.teal;
    case 'accepted':
      return colors.teal;
    case 'no-show':
      return colors.danger;
    case 'pending':
      return colors.gold;
    case 'cancelled':
      return colors.error;
    default:
      return colors.muted;
  }
};

export const getStatusIcon = (status: unknown): IconName => {
  switch (String(status ?? '').toLowerCase()) {
    case 'completed':
      return 'checkmark-circle';
    case 'in progress':
      return 'sync';
    case 'customer ready':
      return 'flag';
    case 'confirmed':
      return 'hand-left';
    case 'accepted':
      return 'hand-left';
    case 'no-show':
      return 'alert-circle';
    case 'pending':
      return 'time';
    case 'cancelled':
      return 'close-circle';
    default:
      return 'ellipsis-horizontal';
  }
};

export const getStatusGuidance = (status: unknown): { title: string; body: string } => {
  const s = String(status ?? '').toLowerCase();
  if (s === 'pending') return { title: 'Finding your technician', body: "You'll be notified the moment one accepts your request." };
  if (s === 'accepted') return { title: 'Confirm your repair', body: 'Confirm the request so your technician knows you really need the repair and will be at the location.' };
  if (s === 'confirmed') return { title: 'Mark it ready', body: 'Let your technician know the service location is ready to receive them.' };
  if (s === 'customer ready') return { title: 'Technician on the way', body: 'Follow them live on the map and have the entry-ready details handy.' };
  if (s === 'in progress') return { title: 'Repairs underway', body: 'Keep your phone nearby — your technician may check in with updates.' };
  if (s === 'completed') return { title: 'Job complete', body: 'A quick review helps your technician and the next customer.' };
  if (s === 'no-show') return { title: 'No-show reported', body: 'The technician found no one at the location. Please reach out to support.' };
  if (s === 'cancelled') return { title: 'Request cancelled', body: "No worries — submit a new request whenever you're ready." };
  return { title: 'Request received', body: 'We’ll get back to you shortly with the next steps.' };
};

export const STEPS: readonly string[] = ['Submitted', 'Accepted', 'Confirmed', 'Ready', 'In progress', 'Done'] as const;
