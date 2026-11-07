import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateEpisodeInput, CreatePatientInput, DischargeContent, EpisodeTransitionInput } from '@recoveros/shared';
import { api, apiPage } from '@/services/api/client';
import type { DischargePlanView, Episode, EpisodeDetail, MedicationEvent, MedicationOrder, Patient, Task } from '@/types/models';

export const recoveryKeys = {
  episodes: (q?: object) => ['episodes', q ?? {}] as const,
  episode: (id: string) => ['episode', id] as const,
  tasks: (episodeId: string, q?: object) => ['tasks', episodeId, q ?? {}] as const,
  today: (episodeId?: string) => ['tasks-today', episodeId ?? 'all'] as const,
  medications: (episodeId: string) => ['medications', episodeId] as const,
  medicationEvents: (episodeId: string) => ['medication-events', episodeId] as const,
  discharge: (episodeId: string) => ['discharge', episodeId] as const,
  patients: (q?: object) => ['patients', q ?? {}] as const,
  patient: (id: string) => ['patient', id] as const,
  pendingApprovals: ['pending-approvals'] as const,
};

export const recoveryApi = {
  episodes: (q: { status?: string; mine?: boolean; patientId?: string; page?: number } = {}) => apiPage<Episode>('/recovery-episodes', { query: { limit: 50, ...q } }),
  episode: (id: string) => api<EpisodeDetail>(`/recovery-episodes/${id}`),
  createEpisode: (body: CreateEpisodeInput) => api<{ episode: Episode }>('/recovery-episodes', { method: 'POST', body }),
  transition: (id: string, body: EpisodeTransitionInput) => api<{ episode: Episode }>(`/recovery-episodes/${id}/transitions`, { method: 'POST', body }),
  assignCareTeam: (id: string, body: { userId: string; role: string }) => api(`/recovery-episodes/${id}/care-team`, { method: 'POST', body }),
  tasks: (episodeId: string, q: { from?: string; to?: string; status?: string; type?: string } = {}) => apiPage<Task>(`/recovery-episodes/${episodeId}/tasks`, { query: { limit: 200, ...q } }),
  today: () => api<{ tasks: Task[] }>('/recovery-tasks/today').then((r) => r.tasks),
  episodeToday: (episodeId: string) => api<{ tasks: Task[] }>(`/recovery-episodes/${episodeId}/tasks/today`).then((r) => r.tasks),
  completeTask: (id: string, body: { status: 'COMPLETED' | 'SKIPPED'; response?: string; idempotencyKey?: string }) => api<{ task: Task }>(`/recovery-tasks/${id}/complete`, { method: 'POST', body }),
  medications: (episodeId: string, includeInactive = false) => api<{ medications: MedicationOrder[] }>(`/recovery-episodes/${episodeId}/medications`, { query: { includeInactive } }).then((r) => r.medications),
  medicationEvents: (episodeId: string) => apiPage<MedicationEvent>(`/recovery-episodes/${episodeId}/medication-events`, { query: { limit: 50 } }),
  dischargePlan: (episodeId: string) => api<DischargePlanView>(`/recovery-episodes/${episodeId}/discharge-plan`),
  createDischargePlan: (episodeId: string, content: DischargeContent) => api<{ plan: { id: string } }>('/discharge-plans', { method: 'POST', body: { episodeId, content } }),
  updateDischargePlan: (planId: string, content: DischargeContent) => api(`/discharge-plans/${planId}`, { method: 'PATCH', body: { content } }),
  submitDischargePlan: (planId: string) => api(`/discharge-plans/${planId}/submit`, { method: 'POST', body: {} }),
  decideDischargePlan: (planId: string, body: { decision: 'APPROVED' | 'REJECTED'; comment?: string; dischargeDate?: string; activate?: boolean }) =>
    api<{ activated: boolean }>(`/discharge-plans/${planId}/approve`, { method: 'POST', body: { activate: true, ...body } }),
  amendDischargePlan: (planId: string, content: DischargeContent, reason: string) => api(`/discharge-plans/${planId}/amendments`, { method: 'POST', body: { content, reason } }),
  recordUnderstanding: (planId: string, body: { method: string; understood: boolean; notes?: string }) => api(`/discharge-plans/${planId}/patient-understanding`, { method: 'POST', body }),
  pendingApprovals: () => api<{ plans: Array<{ id: string; episodeId: string; patientId: { firstName: string; lastName: string; hospitalPatientRef: string }; updatedAt: string }> }>('/discharge-plans/pending-approval').then((r) => r.plans),
  patients: (q: { q?: string; page?: number } = {}) => apiPage<Patient>('/patients', { query: { limit: 30, ...q } }),
  patient: (id: string) => api<{ patient: Patient; episodes: Episode[] }>(`/patients/${id}`),
  createPatient: (body: CreatePatientInput) => api<{ patient: Patient; invitation?: { devToken?: string } }>('/patients', { method: 'POST', body }),
  explain: (body: { dischargePlanVersionId: string; section: string; itemIndex: number; language: string }) =>
    api<{ original: { title: string; details: string }; explanation: { explanation: string; keyPoints: string[] } | null; aiAssisted: boolean; label?: string; fallbackReason?: string }>('/ai/explain-instructions', { method: 'POST', body }),
};

export function useEpisodes(q: { status?: string; mine?: boolean; patientId?: string } = {}, enabled = true) {
  return useQuery({ queryKey: recoveryKeys.episodes(q), queryFn: () => recoveryApi.episodes(q), enabled });
}
export function useEpisode(id?: string) {
  return useQuery({ queryKey: recoveryKeys.episode(id ?? ''), queryFn: () => recoveryApi.episode(id!), enabled: !!id });
}
export function useTodayTasks(enabled = true) {
  return useQuery({ queryKey: recoveryKeys.today(), queryFn: recoveryApi.today, enabled, refetchInterval: 5 * 60_000 });
}
export function useMedications(episodeId?: string) {
  return useQuery({ queryKey: recoveryKeys.medications(episodeId ?? ''), queryFn: () => recoveryApi.medications(episodeId!), enabled: !!episodeId });
}
export function useDischargePlan(episodeId?: string) {
  return useQuery({ queryKey: recoveryKeys.discharge(episodeId ?? ''), queryFn: () => recoveryApi.dischargePlan(episodeId!), enabled: !!episodeId, retry: false });
}
export function usePatients(q: { q?: string } = {}) {
  return useQuery({ queryKey: recoveryKeys.patients(q), queryFn: () => recoveryApi.patients(q) });
}
export function usePatient(id?: string) {
  return useQuery({ queryKey: recoveryKeys.patient(id ?? ''), queryFn: () => recoveryApi.patient(id!), enabled: !!id });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: ReadonlyArray<readonly unknown[]>) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: 'COMPLETED' | 'SKIPPED'; response?: string }) => recoveryApi.completeTask(v.id, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks-today'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Active (open) episode for the signed-in patient or caregiver's selected patient. */
export function useMyActiveEpisode(enabled = true) {
  const q = useEpisodes({}, enabled);
  const open = ['ACTIVE', 'NEEDS_ATTENTION', 'UNDER_REVIEW', 'ON_HOLD'];
  const episode = q.data?.items.find((e) => open.includes(e.status)) ?? q.data?.items[0];
  return { ...q, episode };
}
