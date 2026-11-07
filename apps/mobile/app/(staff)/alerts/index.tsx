import { useState } from 'react';
import { View } from 'react-native';
import { ChoiceChips, EmptyState, ErrorState, Header, LoadingCards, Screen } from '@/components/ui';
import { AlertCard } from '@/components/staff';
import { useAlerts } from '@/features/monitoring/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';

/** Clinical alert queue, sorted by priority then age (server-side scoped to access). */
export default function AlertQueue() {
  const { spacing } = useTheme();
  const [filter, setFilter] = useState<'mine' | 'open' | 'urgent' | 'all'>('mine');
  const q = useAlerts(filter === 'mine' ? { open: true, assignedToMe: true } : filter === 'open' ? { open: true } : filter === 'urgent' ? { open: true, priority: 'HIGH' } : {});
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header title="Alerts" subtitle="Patient-reported concerns matched by hospital-approved rules" />
      <ChoiceChips label="Filter alerts" value={filter} onChange={setFilter} options={[{ value: 'mine', label: 'Assigned to me' }, { value: 'open', label: 'All open' }, { value: 'urgent', label: 'High priority' }, { value: 'all', label: 'History' }]} />
      <View style={{ height: spacing.lg }} />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="checkmark-done-outline" title="No alerts here" message={filter === 'mine' ? 'Nothing assigned to you right now.' : 'No alerts match this filter.'} />
      ) : (
        q.data.items.map((a) => <AlertCard key={a.id} alert={a} />)
      )}
    </Screen>
  );
}
