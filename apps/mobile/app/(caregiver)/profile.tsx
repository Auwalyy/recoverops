import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Row, Section, Text } from '@/components/ui';
import { ProfileScreen } from '@/screens/shared/AccountScreens';
import { careApi, careKeys } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { humanize } from '@/utils/format';

const LABELS: Record<string, string> = {
  VIEW_RECOVERY_PLAN: 'See the recovery plan and daily activities',
  VIEW_MEDICATIONS: 'See the medicine list and schedule',
  REPORT_MEDICATION_EVENTS: 'Record doses taken or missed',
  SUBMIT_CHECKINS: 'Complete check-ins on their behalf',
  VIEW_APPOINTMENTS: 'See appointments',
  MESSAGE_CARE_TEAM: 'Message the care team',
  VIEW_DOCUMENTS: 'See shared documents',
};

/** Permission overview (what the patient granted) + account settings. */
export default function CaregiverAccess() {
  const { colors, spacing } = useTheme();
  const grants = useQuery({ queryKey: careKeys.myGrants, queryFn: careApi.myGrants });
  return (
    <ProfileScreen prefix="/(caregiver)">
        {(grants.data ?? []).map((g) => (
          <Section key={g.consentId} title={`Access granted by ${g.patient?.firstName ?? 'the patient'}`}>
            <Card>
              {Object.keys(LABELS).map((scope) => {
                const on = g.scopes.includes(scope);
                return (
                  <Row key={scope} gap={spacing.md} style={{ paddingVertical: 6 }}>
                    <Ionicons name={on ? 'checkmark-circle' : 'close-circle-outline'} size={20} color={on ? colors.success : colors.textMuted} />
                    <Text variant="bodySmall" tone={on ? 'default' : 'muted'} style={{ flex: 1 }}>
                      {LABELS[scope] ?? humanize(scope)}
                    </Text>
                  </Row>
                );
              })}
              <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
                Only the patient (or their care team on their behalf) can change this access.
              </Text>
            </Card>
          </Section>
        ))}
    </ProfileScreen>
  );
}
