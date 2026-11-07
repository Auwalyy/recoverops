import { useQuery } from '@tanstack/react-query';
import { api, apiPage } from '@/services/api/client';
import type { Alert, AlertAction, CheckIn, CheckInTemplate, MedicationEvent, SafetyMessage, SymptomReport, Task } from '@/types/models';

export const monitoringKeys = {
  templates: ['checkin-templates'] as const,
  template: (id: string) => ['checkin-template', id] as const,
  checkIns: (episodeId: string) => ['checkins', episodeId] as const,
  reviewQueue: ['checkin-review'] as const,
  missed: ['checkin-missed'] as const,
  symptoms: (q: object) => ['symptoms', q] as const,
  alerts: (q: object) => ['alerts', q] as const,
  alert: (id: string) => ['alert', id] as const,
  concerns: ['medication-concerns'] as const,
};

export interface SubmissionResult {
  duplicate: boolean;
  safetyMessages: SafetyMessage[];
}

export const monitoringApi = {
  templates: () => api<{ templates: CheckInTemplate[] }>('/check-in-templates').then((r) => r.templates),
  template: (id: string) => api<{ template: CheckInTemplate }>(`/check-in-templates/${id}`).then((r) => r.template),
  checkIns: (episodeId: string) => apiPage<CheckIn>(`/recovery-episodes/${episodeId}/check-ins`, { query: { limit: 30 } }),
  checkIn: (id: string) => api<{ checkIn: CheckIn }>(`/check-ins/${id}`).then((r) => r.checkIn),
  reviewQueue: () => apiPage<CheckIn>('/check-ins/review-queue', { query: { limit: 50 } }),
  missedQueue: () => apiPage<Task & { patientId: { firstName: string; lastName: string; phone?: string; hospitalPatientRef?: string } }>('/check-ins/missed', { query: { limit: 50 } }),
  reviewCheckIn: (id: string, notes?: string) => api(`/check-ins/${id}/review`, { method: 'POST', body: { notes } }),
  symptoms: (q: { episodeId?: string; pending?: boolean }) => apiPage<SymptomReport>('/symptoms', { query: { limit: 50, ...q } }),
  reviewSymptom: (id: string, notes?: string) => api(`/symptoms/${id}/review`, { method: 'POST', body: { notes } }),
  alerts: (q: { open?: boolean; assignedToMe?: boolean; priority?: string; episodeId?: string; status?: string }) => apiPage<Alert>('/alerts', { query: { limit: 50, ...q } }),
  alert: (id: string) => api<{ alert: Alert; actions: AlertAction[]; assignments: Array<{ id: string; userId: { firstName: string; lastName: string }; reason: string; createdAt: string }> }>(`/alerts/${id}`),
  acknowledge: (id: string) => api(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  addAction: (id: string, body: { type: string; notes: string; contactOutcome?: string; setStatus?: string }) => api(`/alerts/${id}/actions`, { method: 'POST', body }),
  assign: (id: string, body: { userId: string; note?: string }) => api(`/alerts/${id}/assign`, { method: 'POST', body }),
  resolve: (id: string, body: { outcome: string; notes: string }) => api(`/alerts/${id}/resolve`, { method: 'POST', body }),
  concerns: () => apiPage<MedicationEvent>('/medication-concerns', { query: { limit: 50 } }),
  reviewConcern: (id: string, notes?: string) => api(`/medication-events/${id}/review`, { method: 'POST', body: { notes } }),
  summarise: (episodeId: string, periodDays = 7) =>
    api<{ summary: Record<string, string | string[]>; aiAssisted: boolean; label?: string; fallbackReason?: string; facts: { reportingPeriod: { from: string; to: string } } }>('/ai/summarise-recovery', { method: 'POST', body: { episodeId, periodDays } }),
  insights: (episodeId: string) => api<{ insights: Array<{ code: string; message: string }>; disclaimer: string }>(`/ai/recovery-insights/${episodeId}`),
};

export function useTemplates() {
  return useQuery({ queryKey: monitoringKeys.templates, queryFn: monitoringApi.templates, staleTime: 10 * 60_000 });
}
export function useAlerts(q: { open?: boolean; assignedToMe?: boolean; priority?: string; episodeId?: string }, enabled = true) {
  return useQuery({ queryKey: monitoringKeys.alerts(q), queryFn: () => monitoringApi.alerts(q), enabled, refetchInterval: 60_000 });
}
export function useAlert(id?: string) {
  return useQuery({ queryKey: monitoringKeys.alert(id ?? ''), queryFn: () => monitoringApi.alert(id!), enabled: !!id });
}
