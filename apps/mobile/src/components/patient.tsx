import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTime, taskIcon } from '@/utils/format';
import type { SafetyMessage, Task } from '@/types/models';
import { useSync } from '@/offline/sync';
import { useHospitalInfo } from '@/features/care/api';
import { useT } from '@/i18n';

/** One recovery activity row with status and (optional) complete action. */
export function TaskRow({ task, onPress, onComplete }: { task: Task; onPress?: () => void; onComplete?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const done = task.status === 'COMPLETED';
  const missed = task.status === 'MISSED';
  const overdue = task.status === 'PENDING' && new Date(task.dueAt).getTime() < Date.now();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${formatTime(task.dueAt)}, ${done ? 'done' : missed ? 'missed' : overdue ? 'due now' : 'upcoming'}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, opacity: pressed ? 0.75 : 1 })}
    >
      <View style={{ width: 52 }}>
        <Text variant="label" tone={done ? 'muted' : 'default'}>
          {task.localTime ?? formatTime(task.dueAt)}
        </Text>
      </View>
      <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: done ? colors.successSoft : missed ? colors.dangerSoft : colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
        <Ionicons name={done ? 'checkmark' : (taskIcon(task.type) as keyof typeof Ionicons.glyphMap)} size={20} color={done ? colors.success : missed ? colors.danger : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="subheading" tone={done ? 'secondary' : 'default'} style={done ? { textDecorationLine: 'line-through' } : undefined} numberOfLines={2}>
          {task.title}
        </Text>
        {missed ? <Text variant="caption" tone="danger">Missed</Text> : overdue ? <Text variant="caption" tone="warning">Due now</Text> : null}
      </View>
      {onComplete && task.status === 'PENDING' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${task.title} as done`} onPress={onComplete} hitSlop={8} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={22} color={colors.primary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/**
 * Patient-facing safety messages returned IMMEDIATELY by the server from
 * hospital-approved rules. Emergency guidance never depends on staff acknowledgement.
 */
export function SafetyMessages({ messages }: { messages: SafetyMessage[] }) {
  const { colors, spacing } = useTheme();
  if (!messages.length) return null;
  const emergency = messages.find((m) => m.showEmergencyGuidance);
  return (
    <View style={{ gap: spacing.md }}>
      {emergency ? (
        <Card tone="danger" style={{ borderWidth: 1.5, borderColor: colors.danger }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Ionicons name="warning" size={28} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text variant="heading" accessibilityRole="alert">
                Important
              </Text>
              <Text variant="body" style={{ marginTop: 4 }}>
                {emergency.emergencyInstructions ?? 'If you feel this is an emergency, go to the nearest emergency department now.'}
              </Text>
            </View>
          </View>
          {emergency.emergencyPhone ? (
            <Button title={`Call ${emergency.emergencyPhone}`} icon="call" variant="danger" style={{ marginTop: spacing.lg }} onPress={() => void Linking.openURL(`tel:${emergency.emergencyPhone}`)} />
          ) : null}
        </Card>
      ) : null}
      {messages
        .filter((m) => m.message)
        .map((m, i) => (
          <Card key={i} tone="muted">
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Ionicons name="information-circle" size={22} color={colors.info} />
              <Text variant="body" style={{ flex: 1 }}>
                {m.message}
              </Text>
            </View>
          </Card>
        ))}
    </View>
  );
}

/** Always-available emergency information from the hospital. */
export function EmergencyCard({ compact }: { compact?: boolean }) {
  const { colors, spacing } = useTheme();
  const t = useT();
  const { data } = useHospitalInfo();
  const phone = data?.emergencyPhone;
  return (
    <Card tone="muted">
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="medical" size={20} color={colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{t('emergency.title')}</Text>
          {!compact ? (
            <Text variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
              {data?.emergencyInstructions ?? 'If you feel this is an emergency, do not wait for a reply in the app. Go to the nearest emergency department.'}
            </Text>
          ) : null}
        </View>
      </View>
      {phone ? <Button title={t('emergency.call')} icon="call-outline" variant="outline" size="md" style={{ marginTop: spacing.md }} onPress={() => void Linking.openURL(`tel:${phone}`)} /> : null}
    </Card>
  );
}

/** Small pill describing offline sync state. */
export function SyncStatus() {
  const pending = useSync((s) => s.pending);
  const failed = useSync((s) => s.needsAttention.length);
  const online = useSync((s) => s.online);
  if (!pending && !failed && online) return null;
  if (failed) return <Badge tone="danger" icon="alert-circle" label={`${failed} item(s) need attention`} />;
  if (!online) return <Badge tone="warning" icon="cloud-offline-outline" label={pending ? `Offline · ${pending} waiting to send` : 'Offline'} />;
  return <Badge tone="info" icon="sync-outline" label={`Sending ${pending} item(s)…`} />;
}
