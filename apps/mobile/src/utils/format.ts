import type { BadgeTone } from '@/components/ui';

const locale = 'en-NG';

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}
export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  const d = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString(locale, opts);
}
export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(iso)}`;
}
export function relativeTime(iso: string | Date): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (Math.abs(m) < 1) return 'just now';
  if (m > 0 && m < 60) return `${m} min ago`;
  if (m < 0 && m > -60) return `in ${-m} min`;
  const h = Math.round(m / 60);
  if (h > 0 && h < 24) return `${h} h ago`;
  if (h < 0 && h > -24) return `in ${-h} h`;
  const d = Math.round(h / 24);
  return d > 0 ? `${d} d ago` : `in ${-d} d`;
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);
}
export function humanize(code?: string): string {
  if (!code) return '';
  return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}
export function fullName(p?: { firstName?: string; lastName?: string } | string | null): string {
  if (!p || typeof p === 'string') return '';
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
}
export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const episodeStatusTone = (s: string): BadgeTone =>
  ({ ACTIVE: 'success', NEEDS_ATTENTION: 'danger', UNDER_REVIEW: 'warning', ON_HOLD: 'warning', DISCHARGE_PENDING: 'info', DRAFT: 'neutral', COMPLETED: 'primary', TRANSFERRED: 'neutral', CANCELLED: 'neutral' })[s] as BadgeTone ?? 'neutral';

export const priorityTone = (p: string): BadgeTone => ({ CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'info' })[p] as BadgeTone ?? 'neutral';

export const alertStatusTone = (s: string): BadgeTone =>
  ({ GENERATED: 'danger', ASSIGNED: 'warning', ESCALATED: 'danger', ACKNOWLEDGED: 'info', UNDER_REVIEW: 'info', ACTION_REQUIRED: 'warning', RESOLVED: 'success', CLOSED: 'neutral' })[s] as BadgeTone ?? 'neutral';

export const taskIcon = (type: string) =>
  (({
    MEDICATION: 'medkit-outline',
    CHECK_IN: 'clipboard-outline',
    WEEKLY_REVIEW: 'calendar-outline',
    APPOINTMENT_REMINDER: 'calendar-outline',
    REHABILITATION: 'walk-outline',
    WOUND_CARE: 'bandage-outline',
    EDUCATION: 'book-outline',
    MILESTONE: 'flag-outline',
    CUSTOM: 'checkbox-outline',
  }) as const)[type as 'CUSTOM'] ?? 'checkbox-outline';

/** Patient-reported medication statuses are always labelled as reported, never verified. */
export const medicationEventLabel = (s: string) =>
  ({
    REPORTED_TAKEN: 'Reported taken',
    REPORTED_MISSED: 'Reported missed',
    REPORTED_DELAYED: 'Reported taken late',
    UNABLE_TO_OBTAIN: 'Could not obtain',
    NOT_RESPONDED: 'No response',
    REQUIRES_REVIEW: 'Needs review',
  })[s] ?? humanize(s);
