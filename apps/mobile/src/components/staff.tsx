import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, Row, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { alertStatusTone, episodeStatusTone, fullName, humanize, priorityTone, relativeTime } from '@/utils/format';
import type { Alert, Episode } from '@/types/models';

/** Large tappable metric tile for staff dashboards (real counts only). */
export function StatTile({ label, value, icon, tone = 'primary', onPress }: { label: string; value: number | string | undefined; icon: keyof typeof Ionicons.glyphMap; tone?: 'primary' | 'danger' | 'warning' | 'info' | 'success'; onPress?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const fg = { primary: colors.primary, danger: colors.danger, warning: colors.warning, info: colors.info, success: colors.success }[tone];
  const bg = { primary: colors.primarySoft, danger: colors.dangerSoft, warning: colors.warningSoft, info: colors.infoSoft, success: colors.successSoft }[tone];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'summary'}
      accessibilityLabel={`${label}: ${value ?? 'loading'}`}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minWidth: 140, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <Text variant="display" style={{ marginTop: spacing.md }}>
        {value ?? '–'}
      </Text>
      <Text variant="bodySmall" tone="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

export function AlertCard({ alert }: { alert: Alert }) {
  const { colors, spacing } = useTheme();
  const overdue = !alert.acknowledgedAt && alert.acknowledgeDeadline && new Date(alert.acknowledgeDeadline).getTime() < Date.now();
  return (
    <Card onPress={() => router.push(`/(staff)/alerts/${alert.id}`)} accessibilityLabel={`${alert.priority} alert: ${alert.title}`} style={{ marginBottom: spacing.md, borderLeftWidth: 4, borderLeftColor: alert.priority === 'CRITICAL' || alert.priority === 'HIGH' ? colors.danger : alert.priority === 'MEDIUM' ? colors.warning : colors.info }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge label={alert.priority} tone={priorityTone(alert.priority)} />
        <Badge label={humanize(alert.status)} tone={alertStatusTone(alert.status)} />
      </Row>
      <Text variant="subheading" style={{ marginTop: spacing.sm }}>
        {alert.title}
      </Text>
      <Text variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
        {fullName(alert.patientId)}
        {alert.patientId?.hospitalPatientRef ? ` · ${alert.patientId.hospitalPatientRef}` : ''} · {relativeTime(alert.createdAt)}
      </Text>
      <Row style={{ marginTop: spacing.sm, justifyContent: 'space-between' }}>
        <Text variant="caption" tone="secondary">
          {alert.assignedToUserId ? `Assigned to ${fullName(alert.assignedToUserId)}` : 'Unassigned'}
        </Text>
        {overdue ? <Badge label="Acknowledgement overdue" tone="danger" icon="time-outline" /> : alert.escalationLevel ? <Badge label={`Escalated L${alert.escalationLevel}`} tone="warning" /> : null}
      </Row>
    </Card>
  );
}

export function EpisodeRow({ episode }: { episode: Episode }) {
  const { spacing } = useTheme();
  const patient = typeof episode.patientId === 'object' ? episode.patientId : undefined;
  const dept = typeof episode.departmentId === 'object' ? episode.departmentId : undefined;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${fullName(patient)} ${humanize(episode.status)}`} onPress={() => router.push(`/(staff)/episodes/${episode.id}`)} style={({ pressed }) => ({ paddingVertical: spacing.md, opacity: pressed ? 0.7 : 1 })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{fullName(patient)}</Text>
          <Text variant="bodySmall" tone="secondary">
            {patient?.hospitalPatientRef}
            {dept ? ` · ${dept.name}` : ''}
          </Text>
        </View>
        <Badge label={humanize(episode.status)} tone={episodeStatusTone(episode.status)} />
      </Row>
      {episode.stats?.openAlerts ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 4 }}>
          {episode.stats.openAlerts} open alert(s)
        </Text>
      ) : null}
    </Pressable>
  );
}
