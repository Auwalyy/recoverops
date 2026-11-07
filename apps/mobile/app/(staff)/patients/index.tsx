import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Badge, Button, Card, ChoiceChips, EmptyState, ErrorState, Header, ListRow, LoadingCards, Screen, TextField } from '@/components/ui';
import { EpisodeRow } from '@/components/staff';
import { useEpisodes, usePatients } from '@/features/recovery/api';
import { hasPermission, useAuth } from '@/store/auth';
import { errorMessage } from '@/services/api/client';
import { humanize } from '@/utils/format';
import { useTheme } from '@/theme/ThemeProvider';
import { View } from 'react-native';

/** Assigned patients (care-team episodes) and hospital-scoped patient search. */
export default function StaffPatients() {
  const { spacing } = useTheme();
  const user = useAuth((s) => s.user);
  const [mode, setMode] = useState<'mine' | 'active' | 'search'>('mine');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const episodes = useEpisodes(mode === 'mine' ? { mine: true } : { status: 'ACTIVE' }, mode !== 'search');
  const patients = usePatients({ q: debounced || undefined });
  const canSearch = hasPermission(user, 'patients.read');

  return (
    <Screen keyboard onRefresh={() => void (mode === 'search' ? patients.refetch() : episodes.refetch())} refreshing={episodes.isRefetching || patients.isRefetching}>
      <Header title="Patients" right={hasPermission(user, 'patients.create') ? <Button title="New" icon="add" size="sm" fullWidth={false} onPress={() => router.push('/(staff)/patients/new')} /> : undefined} />
      <ChoiceChips
        label="Patient list"
        value={mode}
        onChange={setMode}
        options={[{ value: 'mine', label: 'My care team' }, { value: 'active', label: 'Active programmes' }, ...(canSearch ? [{ value: 'search' as const, label: 'Search' }] : [])]}
      />
      <View style={{ height: spacing.lg }} />
      {mode === 'search' ? (
        <>
          <TextField label="Search by name or hospital number" value={query} onChangeText={setQuery} icon="search-outline" autoCapitalize="none" returnKeyType="search" />
          {patients.isLoading ? (
            <LoadingCards />
          ) : patients.error ? (
            <ErrorState message={errorMessage(patients.error)} onRetry={() => void patients.refetch()} />
          ) : !patients.data?.items.length ? (
            <EmptyState icon="search-outline" title="No patients found" message="Only patients you are authorised to see are listed." />
          ) : (
            <Card>
              {patients.data.items.map((p) => (
                <ListRow key={p.id} icon="person-outline" title={`${p.firstName} ${p.lastName}`} subtitle={`${p.hospitalPatientRef} · ${p.dateOfBirth}`} right={p.status !== 'ACTIVE' ? <Badge label={humanize(p.status)} /> : undefined} onPress={() => router.push(`/(staff)/patients/${p.id}`)} />
              ))}
            </Card>
          )}
        </>
      ) : episodes.isLoading ? (
        <LoadingCards />
      ) : episodes.error ? (
        <ErrorState message={errorMessage(episodes.error)} onRetry={() => void episodes.refetch()} />
      ) : !episodes.data?.items.length ? (
        <EmptyState icon="people-outline" title={mode === 'mine' ? 'No assigned patients' : 'No active programmes'} message={mode === 'mine' ? 'Patients appear here when you join their care team.' : undefined} />
      ) : (
        <Card>
          {episodes.data.items.map((e) => (
            <EpisodeRow key={e.id} episode={e} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
