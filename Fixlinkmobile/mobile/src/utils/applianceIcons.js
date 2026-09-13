export const getApplianceIcon = (type = '') => {
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

export const getStatusColor = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'completed': return '#059669';
    case 'in progress': return '#2563EB';
    case 'accepted': return '#0F766E';
    case 'pending': return '#D97706';
    case 'cancelled': return '#E53935';
    default: return '#5A7A91';
  }
};

export const getStatusIcon = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'completed': return 'checkmark-circle';
    case 'in progress': return 'sync';
    case 'accepted': return 'hand-left';
    case 'pending': return 'time';
    case 'cancelled': return 'close-circle';
    default: return 'ellipsis-horizontal';
  }
};

export const getStatusGuidance = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return { title: 'Finding your technician', body: "You'll be notified the moment one accepts your request." };
  if (s === 'accepted') return { title: 'Technician on the way', body: 'Follow them live on the map and have the entry-ready details handy.' };
  if (s === 'in progress') return { title: 'Repairs underway', body: "Keep your phone nearby — your technician may check in with updates." };
  if (s === 'completed') return { title: 'Job complete', body: 'A quick review helps your technician and the next customer.' };
  if (s === 'cancelled') return { title: 'Request cancelled', body: "No worries — submit a new request whenever you're ready." };
  return { title: 'Request received', body: 'We’ll get back to you shortly with the next steps.' };
};

export const STEPS = ['Submitted', 'Accepted', 'In progress', 'Done'];