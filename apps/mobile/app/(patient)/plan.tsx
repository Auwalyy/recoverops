import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import type { DischargeContent } from '@recoveros/shared';
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Header, ListRow, LoadingCards, Row, Screen, Section, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { recoveryApi, useDischargePlan, useEpisode, useMyActiveEpisode } from '@/features/recovery/api';
import { usePreferences } from '@/store/preferences';
import { errorMessage } from '@/services/api/client';
import { formatDate, fullName, humanize } from '@/utils/format';

type Section = 'clinicalInstructions' | 'medications' | 'woundCare' | 'activityRestrictions' | 'dietaryInstructions' | 'warningSigns' | 'education';

const SECTION_META: Array<{ key: Exclude<Section, 'medications'>; title: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'warningSigns', title: 'Warning signs — get help if you notice', icon: 'warning-outline' },
  { key: 'clinicalInstructions', title: 'Your instructions', icon: 'list-outline' },
  { key: 'woundCare', title: 'Wound care', icon: 'bandage-outline' },
  { key: 'activityRestrictions', title: 'Activity', icon: 'walk-outline' },
  { key: 'dietaryInstructions', title: 'Food and drink', icon: 'restaurant-outline' },
  { key: 'education', title: 'Learn more', icon: 'book-outline' },
];

/** An approved instruction with an optional AI-assisted plain-language explanation. */
function InstructionItem({ versionId, section, index, title, details }: { versionId: string; section: Section; index: number; title: string; details: string }) {
  const { colors, spacing, radius } = useTheme();
  const language = usePreferences((s) => s.language);
  const explain = useMutation({ mutationFn: () => recoveryApi.explain({ dischargePlanVersionId: versionId, section, itemIndex: index, language }) });
  const result = explain.data;
  return (
    <View style={{ paddingVertical: spacing.md }}>
      <Text variant="subheading">{title}</Text>
      <Text variant="body" tone="secondary" style={{ marginTop: 4 }}>
        {details}
      </Text>
      {result?.explanation ? (
        <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.infoSoft }}>
          <Row gap={6} style={{ marginBottom: 6 }}>
            <Ionicons name="sparkles-outline" size={16} color={colors.info} />
            <Text variant="caption" style={{ color: colors.info }}>
              AI-assisted explanation
            </Text>
          </Row>
          <Text variant="body">{result.explanation.explanation}</Text>
          {result.explanation.keyPoints.map((k, i) => (
            <Text key={i} variant="bodySmall" style={{ marginTop: 4 }}>
              • {k}
            </Text>
          ))}
          <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
            {result.label} Your care team's instruction above always takes priority.
          </Text>
        </View>
      ) : result && !result.explanation ? (
        <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
          {result.fallbackReason}
        </Text>
      ) : explain.error ? (
        <Text variant="caption" tone="danger" style={{ marginTop: spacing.sm }}>
          {errorMessage(explain.error)}
        </Text>
      ) : null}
      {!result ? (
        <Button title="Explain in simple words" icon="sparkles-outline" variant="ghost" size="sm" fullWidth={false} loading={explain.isPending} onPress={() => explain.mutate()} style={{ marginTop: spacing.sm, marginLeft: -12 }} />
      ) : null}
    </View>
  );
}

export default function MyPlan() {
  const { spacing, colors } = useTheme();
  const { episode, isLoading: epLoading } = useMyActiveEpisode();
  const detail = useEpisode(episode?.id);
  const plan = useDischargePlan(episode?.id);
  const version = plan.data?.approvedVersion;
  const content = version?.content as DischargeContent | undefined;

  return (
    <Screen onRefresh={() => void plan.refetch()} refreshing={plan.isRefetching}>
      <Header title="My recovery plan" subtitle="Approved by your care team" />
      {epLoading || plan.isLoading ? (
        <LoadingCards count={4} />
      ) : !episode ? (
        <EmptyState title="No plan yet" message="Your plan will appear once your care team approves your discharge." />
      ) : plan.error || !version || !content ? (
        <ErrorState title="Plan not available" message="Your approved plan is not available yet. Pull to refresh or contact your care team." onRetry={() => void plan.refetch()} />
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="overline" tone="secondary">
                Programme
              </Text>
              <Badge label={`Version ${version.versionNumber}`} tone="primary" icon="shield-checkmark-outline" />
            </Row>
            <Text variant="heading" style={{ marginTop: 4 }}>
              {episode.programmeName ?? 'Recovery programme'}
            </Text>
            {detail.data?.plan ? (
              <Text variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                {formatDate(detail.data.plan.startDate)} – {formatDate(detail.data.plan.endDate)}
              </Text>
            ) : null}
            {content.summary ? (
              <Text variant="body" style={{ marginTop: spacing.md }}>
                {content.summary}
              </Text>
            ) : null}
          </Card>

          {content.warningSigns.length ? (
            <View style={{ marginTop: spacing.xl }}>
              <Banner tone="danger" title="If you notice any warning sign" message="Contact your care team straight away. In an emergency, go to the nearest emergency department." />
            </View>
          ) : null}

          {content.medications.length ? (
            <Section title="Medicines" action={<Button title="Schedule" variant="ghost" size="sm" fullWidth={false} onPress={() => router.push('/(patient)/medications')} />}>
              <Card>
                {content.medications.map((m, i) => (
                  <InstructionItem key={`m${i}`} versionId={version.id} section="medications" index={i} title={`${m.name}${m.strength ? ` ${m.strength}` : ''}`} details={`${m.dose} · ${m.frequencyText}${m.instructions ? `. ${m.instructions}` : ''}`} />
                ))}
              </Card>
            </Section>
          ) : null}

          {SECTION_META.filter((s) => content[s.key].length).map((s) => (
            <Section key={s.key} title={s.title}>
              <Card tone={s.key === 'warningSigns' ? 'danger' : 'default'}>
                {content[s.key].map((item, i) => (
                  <InstructionItem key={i} versionId={version.id} section={s.key} index={i} title={item.title} details={item.details} />
                ))}
              </Card>
            </Section>
          ))}

          {content.followUps.length ? (
            <Section title="Follow-up">
              <Card>
                {content.followUps.map((f, i) => (
                  <ListRow key={i} icon="calendar-outline" title={f.description} subtitle={f.dueDate ? `Due ${formatDate(f.dueDate)}` : humanize(f.type)} />
                ))}
              </Card>
            </Section>
          ) : null}

          {detail.data?.careTeam.length ? (
            <Section title="Your care team">
              <Card>
                {detail.data.careTeam.map((m) => (
                  <ListRow key={m.id} icon="person-outline" title={fullName(m.user)} subtitle={humanize(m.role)} />
                ))}
              </Card>
            </Section>
          ) : null}
          <Text variant="caption" tone="secondary" align="center" style={{ marginTop: spacing.xl, color: colors.textSecondary }}>
            These instructions were approved by your clinician{version.approvedAt ? ` on ${formatDate(version.approvedAt)}` : ''}. Only your care team can change them.
          </Text>
        </>
      )}
    </Screen>
  );
}
