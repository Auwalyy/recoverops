import { Tabs } from 'expo-router';
import { RequireExperience } from '@/components/guards';
import { tabIcon, useTabBarOptions } from '@/navigation/tabOptions';
import { hasPermission, useAuth } from '@/store/auth';

const HIDDEN = [
  'patients/[id]',
  'patients/new',
  'episodes/[id]',
  'discharge/[episodeId]',
  'alerts/[id]',
  'queues/checkins',
  'queues/missed',
  'queues/medications',
  'appointments',
  'appointments-new',
  'rehab/[planId]',
  'messages/[id]',
  'messages/new',
  'notifications',
  'language',
  'analytics',
];

/**
 * Staff shell. Tabs adapt to the permission set resolved by the server (e.g. a
 * physiotherapist without alerts.read does not see the Alerts tab). The backend still
 * enforces every permission.
 */
export default function StaffLayout() {
  const options = useTabBarOptions();
  const user = useAuth((s) => s.user);
  const canAlerts = hasPermission(user, 'alerts.read');
  const canRehab = hasPermission(user, 'rehabilitation.manage');
  return (
    <RequireExperience experience="STAFF">
      <Tabs screenOptions={options}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('grid-outline', 'grid') }} />
        <Tabs.Screen name="patients/index" options={{ title: 'Patients', tabBarIcon: tabIcon('people-outline', 'people') }} />
        <Tabs.Screen name="alerts/index" options={{ title: 'Alerts', tabBarIcon: tabIcon('alert-circle-outline', 'alert-circle'), href: canAlerts ? undefined : null }} />
        <Tabs.Screen name="sessions" options={{ title: 'Sessions', tabBarIcon: tabIcon('walk-outline', 'walk'), href: canRehab ? undefined : null }} />
        <Tabs.Screen name="messages/index" options={{ title: 'Messages', tabBarIcon: tabIcon('chatbubbles-outline', 'chatbubbles') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }} />
        {HIDDEN.map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
    </RequireExperience>
  );
}
