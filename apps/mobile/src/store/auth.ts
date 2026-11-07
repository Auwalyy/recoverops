import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type { AuthTokens, AuthUser } from '@recoveros/shared';
import { api, ApiError, configureApiClient, refreshSession } from '@/services/api/client';
import { tokenStorage } from '@/services/tokenStorage';

export type Experience = 'PATIENT' | 'STAFF' | 'CAREGIVER' | 'PLATFORM';

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: AuthUser | null;
  /** Which experience the user is acting in (a doctor may also be a patient elsewhere). */
  actingAs: Experience | null;
  activeHospitalId: string | null;
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  acceptInvitation: (input: { token: string; password: string; firstName?: string; lastName?: string }) => Promise<void>;
  refreshMe: () => Promise<void>;
  switchContext: (experience: Experience, hospitalId?: string) => Promise<void>;
  logout: (reason?: 'user' | 'expired') => Promise<void>;
}

/** Cleanup hooks (query cache, offline DB, realtime) registered by the app shell. */
const logoutHooks: Array<() => Promise<void> | void> = [];
export function onLogout(fn: () => Promise<void> | void) {
  logoutHooks.push(fn);
}

function defaultExperience(user: AuthUser): Experience {
  if (user.memberships.length) return 'STAFF';
  if (user.patientProfiles.length) return 'PATIENT';
  if (user.caregiverOf.length) return 'CAREGIVER';
  return 'PLATFORM';
}

export const useAuth = create<AuthState>((set, get) => {
  configureApiClient({
    contextHeaders: () => {
      const { actingAs, activeHospitalId } = get();
      const h: Record<string, string> = {};
      if (actingAs && actingAs !== 'PLATFORM') h['x-acting-as'] = actingAs;
      if (activeHospitalId) h['x-hospital-id'] = activeHospitalId;
      return h;
    },
    onSessionExpired: () => {
      if (get().status === 'signedIn') void get().logout('expired');
    },
  });

  const loadMe = async () => {
    const { user } = await api<{ user: AuthUser }>('/auth/me');
    const actingAs = get().actingAs ?? defaultExperience(user);
    set({ user, actingAs, activeHospitalId: user.activeHospitalId ?? get().activeHospitalId, status: 'signedIn' });
  };

  const device = () => ({ name: Device.modelName ?? undefined, platform: (Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'other') as 'android' | 'ios' | 'other' });

  return {
    status: 'loading',
    user: null,
    actingAs: null,
    activeHospitalId: null,

    async bootstrap() {
      const { refresh } = await tokenStorage.load();
      if (!refresh) return set({ status: 'signedOut' });
      try {
        // Always start a session with a fresh rotation so a stolen old token is detected.
        if (!(await refreshSession())) throw new Error('refresh failed');
        await loadMe();
      } catch (err) {
        if (err instanceof ApiError && err.isNetwork) {
          // Offline start: keep the session; screens render cached data and sync later.
          set({ status: 'signedIn' });
          return;
        }
        await tokenStorage.clear();
        set({ status: 'signedOut', user: null });
      }
    },

    async login(identifier, password) {
      const res = await api<{ tokens: AuthTokens; user: AuthUser }>('/auth/login', { method: 'POST', auth: false, body: { identifier, password, device: device() } });
      await tokenStorage.setTokens(res.tokens.accessToken, res.tokens.refreshToken);
      set({ user: res.user, actingAs: defaultExperience(res.user), activeHospitalId: null });
      await loadMe();
    },

    async acceptInvitation(input) {
      const res = await api<{ tokens: AuthTokens; user: AuthUser }>('/auth/invitations/accept', { method: 'POST', auth: false, body: input });
      await tokenStorage.setTokens(res.tokens.accessToken, res.tokens.refreshToken);
      set({ user: res.user, actingAs: defaultExperience(res.user), activeHospitalId: null });
      await loadMe();
    },

    refreshMe: loadMe,

    async switchContext(experience, hospitalId) {
      set({ actingAs: experience, activeHospitalId: hospitalId ?? null });
      if (hospitalId) {
        const r = await api<{ accessToken: string }>('/auth/switch-hospital', { method: 'POST', body: { hospitalId } });
        await tokenStorage.setAccessToken(r.accessToken);
      }
      await loadMe();
    },

    async logout() {
      try {
        if (tokenStorage.getAccessToken()) await api('/auth/logout', { method: 'POST', timeoutMs: 5000 });
      } catch {
        /* best effort — local cleanup always happens */
      }
      await tokenStorage.clear();
      for (const hook of logoutHooks) await Promise.resolve(hook()).catch(() => undefined);
      set({ status: 'signedOut', user: null, actingAs: null, activeHospitalId: null });
    },
  };
});

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return !!user?.permissions.includes(permission);
}

export function staffRoles(user: AuthUser | null, hospitalId?: string | null): string[] {
  if (!user) return [];
  const m = user.memberships.find((x) => x.hospitalId === (hospitalId ?? user.activeHospitalId)) ?? user.memberships[0];
  return m?.roles ?? [];
}
