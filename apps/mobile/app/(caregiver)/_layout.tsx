import { Tabs } from 'expo-router';
import { RequireExperience } from '@/components/guards';
import { tabIcon, useTabBarOptions } from '@/navigation/tabOptions';
import { hasPermission, useAuth } from '@/store/auth';

const HIDDEN = ['check-in', 'medications', 'appointments/[id]', 'messages/[id]', 'messages/new', 'notifications', 'language', 'help'];

/** Caregiver shell — tabs reflect the scopes the patient granted (server-enforced). */
export default function CaregiverLayout() {
  const options = useTabBarOptions();
  const user = useAuth((s) => s.user);
  return (
    <RequireExperience experience="CAREGIVER">
      <Tabs screenOptions={options}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home') }} />
        <Tabs.Screen name="appointments/index" options={{ title: 'Appointments', tabBarIcon: tabIcon('calendar-outline', 'calendar'), href: hasPermission(user, 'appointments.read') ? undefined : null }} />
        <Tabs.Screen name="messages/index" options={{ title: 'Messages', tabBarIcon: tabIcon('chatbubbles-outline', 'chatbubbles'), href: hasPermission(user, 'messages.read') ? undefined : null }} />
        <Tabs.Screen name="profile" options={{ title: 'Access', tabBarIcon: tabIcon('shield-checkmark-outline', 'shield-checkmark') }} />
        {HIDDEN.map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
    </RequireExperience>
  );
}
