import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/services/api/client';
import { tokenStorage } from '@/services/tokenStorage';
import { careApi } from '@/features/care/api';
import { useAuth } from '@/store/auth';
import { useSync } from '@/offline/sync';

// Show notifications while the app is foregrounded (content is generic by design).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/** Register for push and send the Expo push token to the backend (per session). */
async function registerPush(): Promise<void> {
  if (!Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Recovery reminders', importance: Notifications.AndroidImportance.HIGH, lightColor: '#0D6E63' });
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await careApi.registerPushToken(token.data);
  } catch {
    // Push requires an EAS project id in development builds; reminders still appear in-app.
  }
}

/**
 * App-wide services for a signed-in user: push registration, notification deep links,
 * realtime updates (private user room only), and offline outbox synchronisation.
 */
export function useAppServices(): void {
  const qc = useQueryClient();
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.user?.id);
  const actingAs = useAuth((s) => s.actingAs);

  // Push + notification taps → navigate to the relevant (permission-checked) screen.
  useEffect(() => {
    if (status !== 'signedIn') return;
    void registerPush();
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as Record<string, string> | undefined;
      if (!data) return;
      const staff = useAuth.getState().actingAs === 'STAFF';
      if (data.alertId && staff) router.push(`/(staff)/alerts/${data.alertId}`);
      else if (data.conversationId) router.push(staff ? `/(staff)/messages/${data.conversationId}` : `/(patient)/messages/${data.conversationId}`);
      else if (data.appointmentId && !staff) router.push(`/(patient)/appointments/${data.appointmentId}`);
      else if (data.taskId && !staff) router.push('/(patient)/tasks');
    });
    return () => sub.remove();
  }, [status]);

  // Realtime: invalidate the affected queries; never trust payload contents for display.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const token = tokenStorage.getAccessToken();
    if (!token) return;
    const socket: Socket = io(API_URL, { path: '/realtime', transports: ['websocket'], auth: { token } });
    socket.on('alert:new', () => void qc.invalidateQueries({ queryKey: ['alerts'] }));
    socket.on('alert:updated', (p: { alertId: string }) => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: ['alert', p.alertId] });
    });
    socket.on('message:new', (p: { conversationId: string }) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['messages', p.conversationId] });
    });
    socket.on('checkin:new', () => void qc.invalidateQueries({ queryKey: ['checkin-review'] }));
    socket.on('task:updated', () => void qc.invalidateQueries({ queryKey: ['tasks-today'] }));
    socket.on('appointment:updated', () => void qc.invalidateQueries({ queryKey: ['appointments'] }));
    socket.on('episode:updated', (p: { episodeId: string }) => void qc.invalidateQueries({ queryKey: ['episode', p.episodeId] }));
    socket.on('notification:new', () => void qc.invalidateQueries({ queryKey: ['notifications'] }));
    socket.on('connect_error', () => undefined);
    return () => {
      socket.disconnect();
    };
  }, [status, actingAs, qc]);

  // Offline sync: flush the outbox on reconnect and when the app returns to foreground.
  useEffect(() => {
    if (status !== 'signedIn' || !userId) return;
    const sync = useSync.getState();
    void sync.refresh(userId).then(() => sync.flush(userId));
    const netSub = Network.addNetworkStateListener((s) => {
      const online = !!s.isConnected && s.isInternetReachable !== false;
      useSync.getState().setOnline(online);
      if (online) {
        void useSync.getState().flush(userId).then(() => qc.invalidateQueries());
      }
    });
    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void useSync.getState().flush(userId);
    });
    return () => {
      netSub.remove();
      appSub.remove();
    };
  }, [status, userId, qc]);
}
