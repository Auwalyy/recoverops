import { Tabs } from 'expo-router';
import { RequireExperience } from '@/components/guards';
import { tabIcon, useTabBarOptions } from '@/navigation/tabOptions';
import { useT } from '@/i18n';

const HIDDEN = [
  'tasks',
  'medications',
  'medication-history',
  'check-in',
  'symptom',
  'appointments/index',
  'appointments/[id]',
  'rehabilitation',
  'messages/[id]',
  'messages/new',
  'notifications',
  'documents',
  'caregivers',
  'language',
  'help',
];

export default function PatientLayout() {
  const t = useT();
  const options = useTabBarOptions();
  return (
    <RequireExperience experience="PATIENT">
      <Tabs screenOptions={options}>
        <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline', 'home') }} />
        <Tabs.Screen name="plan" options={{ title: t('tabs.plan'), tabBarIcon: tabIcon('document-text-outline', 'document-text') }} />
        <Tabs.Screen name="messages/index" options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('chatbubbles-outline', 'chatbubbles') }} />
        <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }} />
        {HIDDEN.map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
    </RequireExperience>
  );
}
