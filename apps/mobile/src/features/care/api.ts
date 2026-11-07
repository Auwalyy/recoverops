import { useQuery } from '@tanstack/react-query';
import { api, apiPage } from '@/services/api/client';
import type {
  Appointment,
  CaregiverConsent,
  Conversation,
  Dashboard,
  Department,
  DocumentItem,
  Message,
  NotificationItem,
  RehabPlan,
  RehabSession,
  StaffMember,
} from '@/types/models';

export const careKeys = {
  appointments: (q: object) => ['appointments', q] as const,
  appointment: (id: string) => ['appointment', id] as const,
  rehabPlans: (q: object) => ['rehab-plans', q] as const,
  rehabPlan: (id: string) => ['rehab-plan', id] as const,
  rehabSessions: (q: object) => ['rehab-sessions', q] as const,
  conversations: ['conversations'] as const,
  messages: (id: string) => ['messages', id] as const,
  notifications: ['notifications'] as const,
  caregivers: ['caregivers'] as const,
  documents: (q: object) => ['documents', q] as const,
  hospital: ['hospital-public'] as const,
  staff: (q: object) => ['staff', q] as const,
  departments: ['departments'] as const,
  dashboard: ['dashboard'] as const,
  workload: ['workload'] as const,
  myGrants: ['caregiver-grants'] as const,
};

export const careApi = {
  appointments: (q: { episodeId?: string; from?: string; mine?: boolean; status?: string } = {}) => apiPage<Appointment>('/appointments', { query: { limit: 50, ...q } }),
  appointment: (id: string) => api<{ appointment: Appointment }>(`/appointments/${id}`).then((r) => r.appointment),
  createAppointment: (body: Record<string, unknown>) => api<{ appointment: Appointment }>('/appointments', { method: 'POST', body }),
  updateAppointment: (id: string, body: Record<string, unknown>) => api<{ appointment: Appointment }>(`/appointments/${id}`, { method: 'PATCH', body }),
  respondAppointment: (id: string, body: { action: 'CONFIRM' | 'REQUEST_RESCHEDULE'; reason?: string }) => api(`/appointments/${id}/respond`, { method: 'POST', body }),
  rehabPlans: (q: { episodeId?: string; mine?: boolean } = {}) => api<{ plans: RehabPlan[] }>('/rehabilitation/plans', { query: q }).then((r) => r.plans),
  rehabPlan: (id: string) => api<{ plan: RehabPlan; sessions: RehabSession[]; attendanceRate: number | null }>(`/rehabilitation/plans/${id}`),
  rehabSessions: (q: { from?: string; mine?: boolean } = {}) => apiPage<RehabSession>('/rehabilitation/sessions', { query: { limit: 50, ...q } }),
  scheduleSession: (body: { planId: string; scheduledAt: string; durationMinutes?: number; location?: string; mode?: string }) => api('/rehabilitation/sessions', { method: 'POST', body }),
  recordSession: (id: string, body: { status: string; progressNotes?: string; assessment?: Record<string, number | string> }) => api(`/rehabilitation/sessions/${id}/record`, { method: 'POST', body }),
  achieveMilestone: (planId: string, milestoneId: string, notes?: string) => api(`/rehabilitation/plans/${planId}/milestones/${milestoneId}/achieve`, { method: 'POST', body: { notes } }),
  reviewRehabPlan: (planId: string, reviewNote: string) => api(`/rehabilitation/plans/${planId}`, { method: 'PATCH', body: { reviewNote } }),
  conversations: () => apiPage<Conversation>('/conversations', { query: { limit: 50 } }),
  messages: (id: string) => api<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}/messages`, { query: { limit: 100 } }),
  createConversation: (body: { subject: string; category: string; initialMessage: string; patientId?: string }) => api<{ conversation: Conversation }>('/conversations', { method: 'POST', body }),
  sendMessage: (id: string, body: { body: string; type?: 'TEXT' | 'CALLBACK_REQUEST'; idempotencyKey?: string }) => api<{ message: Message }>(`/conversations/${id}/messages`, { method: 'POST', body }),
  notifications: () => apiPage<NotificationItem>('/notifications', { query: { limit: 50 } }),
  markNotificationsRead: () => api('/notifications/read', { method: 'POST', body: { all: true } }),
  caregivers: (patientId?: string) => api<{ caregivers: CaregiverConsent[] }>('/caregivers', { query: { patientId } }).then((r) => r.caregivers),
  inviteCaregiver: (body: { name: string; relationship: string; email?: string; phone?: string; scopes: string[]; expiresInDays?: number }) => api('/caregivers/invitations', { method: 'POST', body }),
  updateCaregiverScopes: (id: string, scopes: string[]) => api(`/caregivers/${id}/scopes`, { method: 'PATCH', body: { scopes } }),
  revokeCaregiver: (id: string, reason?: string) => api(`/caregivers/${id}/revoke`, { method: 'POST', body: { reason } }),
  myGrants: () => api<{ grants: Array<{ consentId: string; scopes: string[]; permissions: string[]; patient?: { id: string; firstName: string; lastName: string } }> }>('/caregivers/me').then((r) => r.grants),
  documents: (q: { episodeId?: string; patientId?: string } = {}) => api<{ documents: DocumentItem[] }>('/documents', { query: q }).then((r) => r.documents),
  downloadUrl: (id: string) => api<{ url: string; expiresInSeconds: number }>(`/documents/${id}/download-url`),
  hospital: () => api<{ hospital: { id: string; name: string; phone: string; emergencyPhone: string; emergencyInstructions?: string } }>('/hospitals/me/public').then((r) => r.hospital),
  staff: (q: { role?: string } = {}) => api<{ staff: StaffMember[] }>('/hospitals/staff', { query: q }).then((r) => r.staff),
  departments: () => api<{ departments: Department[] }>('/hospitals/departments').then((r) => r.departments),
  dashboard: () => api<Dashboard>('/analytics/dashboard'),
  workload: () => api<{ assignedOpenAlerts: number; appointmentsToday: number }>('/analytics/my-workload'),
  sessions: () => api<{ sessions: Array<{ id: string; deviceName?: string; platform?: string; lastUsedAt?: string; current: boolean }> }>('/auth/sessions').then((r) => r.sessions),
  revokeSession: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
  updateProfile: (body: { preferredLanguage?: string }) => api('/auth/me', { method: 'PATCH', body }),
  registerPushToken: (pushToken: string | null) => api('/auth/push-token', { method: 'POST', body: { pushToken } }),
};

export function useAppointments(q: { episodeId?: string; from?: string; mine?: boolean } = {}, enabled = true) {
  return useQuery({ queryKey: careKeys.appointments(q), queryFn: () => careApi.appointments(q), enabled });
}
export function useConversations() {
  return useQuery({ queryKey: careKeys.conversations, queryFn: careApi.conversations, refetchInterval: 60_000 });
}
export function useNotifications() {
  return useQuery({ queryKey: careKeys.notifications, queryFn: careApi.notifications });
}
export function useHospitalInfo(enabled = true) {
  return useQuery({ queryKey: careKeys.hospital, queryFn: careApi.hospital, staleTime: 60 * 60_000, enabled });
}
export function useStaff(q: { role?: string } = {}) {
  return useQuery({ queryKey: careKeys.staff(q), queryFn: () => careApi.staff(q), staleTime: 5 * 60_000 });
}
