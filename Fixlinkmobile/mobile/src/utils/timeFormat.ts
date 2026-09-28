// Shared time formatters. Previously each screen had its own copy
// (formatNotificationTime, formatMessageTime, formatCardDate, formatSchedule).
export const formatNotificationTime = (value: unknown): string => {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
};

export const formatMessageTime = (value: unknown): string => {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export const formatDayDivider = (value: unknown): string => {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString();
};

export const formatCardDate = (value: unknown): string => {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
