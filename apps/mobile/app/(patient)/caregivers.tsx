import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CAREGIVER_SCOPE_KEYS } from '@recoveros/shared';
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Header, LoadingCards, Row, Screen, Section, Text, TextField } from '@/components/ui';
import { careApi, careKeys } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';
import { formatDate, humanize } from '@/utils/format';
import type { CaregiverConsent } from '@/types/models';

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  VIEW_RECOVERY_PLAN: { label: 'See my recovery plan', description: 'Instructions and daily activities' },
  VIEW_MEDICATIONS: { label: 'See my medicines', description: 'Medicine list and schedule' },
  REPORT_MEDICATION_EVENTS: { label: 'Record my doses', description: 'Mark doses as taken or missed for me' },
  SUBMIT_CHECKINS: { label: 'Do check-ins for me', description: 'Answer daily check-ins on my behalf' },
  VIEW_APPOINTMENTS: { label: 'See my appointments', description: 'Dates, times and locations' },
  MESSAGE_CARE_TEAM: { label: 'Message my care team', description: 'Read and send messages about my care' },
  VIEW_DOCUMENTS: { label: 'See my documents', description: 'Discharge documents shared with me' },
};

function ScopePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {CAREGIVER_SCOPE_KEYS.map((s) => {
        const on = value.includes(s);
        return (
          <Pressable
            key={s}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={SCOPE_LABELS[s]?.label}
            onPress={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }}
          >
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text variant="label">{SCOPE_LABELS[s]?.label}</Text>
              <Text variant="caption" tone="secondary">
                {SCOPE_LABELS[s]?.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function CaregiverCard({ c }: { c: CaregiverConsent }) {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [scopes, setScopes] = useState(c.scopes);
  const update = useMutation({ mutationFn: () => careApi.updateCaregiverScopes(c.id, scopes), onSuccess: () => { setEditing(false); void qc.invalidateQueries({ queryKey: careKeys.caregivers }); } });
  const revoke = useMutation({ mutationFn: () => careApi.revokeCaregiver(c.id, 'Revoked by patient'), onSuccess: () => void qc.invalidateQueries({ queryKey: careKeys.caregivers }) });
  const active = c.status === 'ACTIVE' || c.status === 'INVITED';
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="heading">{c.caregiverId.name}</Text>
          <Text variant="bodySmall" tone="secondary">
            {c.relationship} · {active ? `until ${formatDate(c.expiresAt)}` : humanize(c.status)}
          </Text>
        </View>
        <Badge label={c.status === 'INVITED' ? 'Invitation sent' : humanize(c.status)} tone={c.status === 'ACTIVE' ? 'success' : c.status === 'INVITED' ? 'info' : 'neutral'} />
      </Row>
      {editing ? (
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          <ScopePicker value={scopes} onChange={setScopes} />
          {update.error ? <Text variant="caption" tone="danger">{errorMessage(update.error)}</Text> : null}
          <Button title="Save permissions" disabled={!scopes.length} loading={update.isPending} onPress={() => update.mutate()} />
          <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
        </View>
      ) : (
        <>
          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: spacing.md }}>
            {c.scopes.map((s) => (
              <Badge key={s} label={SCOPE_LABELS[s]?.label ?? humanize(s)} tone="primary" />
            ))}
          </Row>
          {active ? (
            <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
              <Button title="Change access" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setEditing(true)} />
              <Button
                title="Remove"
                variant="ghost"
                size="md"
                fullWidth={false}
                loading={revoke.isPending}
                onPress={() =>
                  Alert.alert('Remove caregiver?', `${c.caregiverId.name} will immediately lose access to your recovery information.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => revoke.mutate() },
                  ])
                }
              />
            </Row>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Patient-controlled caregiver consent: invite, choose permissions, change, revoke. */
export default function Caregivers() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: careKeys.caregivers, queryFn: () => careApi.caregivers() });
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ name: '', relationship: '', phone: '', email: '' });
  const [scopes, setScopes] = useState<string[]>(['VIEW_APPOINTMENTS']);
  const invite = useMutation({
    mutationFn: () => careApi.inviteCaregiver({ name: form.name.trim(), relationship: form.relationship.trim(), phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, scopes }),
    onSuccess: () => {
      setInviting(false);
      setForm({ name: '', relationship: '', phone: '', email: '' });
      void qc.invalidateQueries({ queryKey: careKeys.caregivers });
    },
  });
  const valid = form.name.trim() && form.relationship.trim() && (form.phone.trim() || form.email.trim()) && scopes.length;

  return (
    <Screen keyboard onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Caregivers" subtitle="You decide who can help and what they can see." />
      {inviting ? (
        <Card>
          <TextField label="Full name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <TextField label="Relationship" value={form.relationship} onChangeText={(relationship) => setForm({ ...form, relationship })} placeholder="e.g. Daughter" />
          <TextField label="Phone number" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" placeholder="+234…" />
          <TextField label="Email (optional)" value={form.email} onChangeText={(email) => setForm({ ...form, email })} keyboardType="email-address" autoCapitalize="none" />
          <Text variant="label" style={{ marginBottom: spacing.sm }}>
            What can they do?
          </Text>
          <ScopePicker value={scopes} onChange={setScopes} />
          {invite.error ? (
            <View style={{ marginTop: spacing.md }}>
              <Banner tone="danger" title="Could not send invitation" message={errorMessage(invite.error)} />
            </View>
          ) : null}
          <Button title="Send invitation" style={{ marginTop: spacing.lg }} disabled={!valid} loading={invite.isPending} onPress={() => invite.mutate()} />
          <Button title="Cancel" variant="ghost" onPress={() => setInviting(false)} />
        </Card>
      ) : (
        <Button title="Invite a caregiver" icon="person-add-outline" onPress={() => setInviting(true)} />
      )}
      <Section title="People who can help">
        {q.isLoading ? (
          <LoadingCards count={2} />
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState icon="people-outline" title="No caregivers yet" message="Invite a family member or friend to help you follow your plan." />
        ) : (
          q.data.map((c) => <CaregiverCard key={c.id} c={c} />)
        )}
      </Section>
    </Screen>
  );
}
