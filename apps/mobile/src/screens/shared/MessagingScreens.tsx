import { useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MESSAGE_CATEGORIES } from '@recoveros/shared';
import { Badge, Banner, Button, Card, ChoiceChips, EmptyState, ErrorState, Header, ListRow, LoadingCards, Screen, Text, TextField } from '@/components/ui';
import { careApi, careKeys, useConversations } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { errorMessage } from '@/services/api/client';
import { newIdempotencyKey } from '@/offline/sync';
import { formatTime, fullName, humanize, relativeTime } from '@/utils/format';

type Base = '/(patient)/messages' | '/(caregiver)/messages' | '/(staff)/messages';

export function ConversationListScreen({ base, canStart = true, title = 'Messages' }: { base: Base; canStart?: boolean; title?: string }) {
  const { spacing } = useTheme();
  const q = useConversations();
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header title={title} right={canStart ? <Button title="New" icon="create-outline" size="sm" fullWidth={false} onPress={() => router.push(`${base}/new`)} /> : undefined} />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="chatbubbles-outline" title="No conversations yet" message="Send a message to your care team about anything that is not urgent." action={canStart ? { label: 'Start a conversation', onPress: () => router.push(`${base}/new`) } : undefined} />
      ) : (
        <Card>
          {q.data.items.map((c) => (
            <ListRow
              key={c.id}
              icon={c.callbackRequested ? 'call-outline' : 'chatbubble-outline'}
              title={c.patientId && base === '/(staff)/messages' ? `${fullName(c.patientId)} · ${c.subject}` : c.subject}
              subtitle={`${humanize(c.category)}${c.lastMessageAt ? ` · ${relativeTime(c.lastMessageAt)}` : ''}`}
              right={c.unreadCount ? <Badge label={String(c.unreadCount)} tone="primary" /> : c.status === 'CLOSED' ? <Badge label="Closed" /> : undefined}
              onPress={() => router.push(`${base}/${c.id}`)}
            />
          ))}
        </Card>
      )}
      <Text variant="caption" tone="secondary" align="center" style={{ marginTop: spacing.lg }}>
        Messages are not monitored around the clock. In an emergency, call the hospital or go to the nearest emergency department.
      </Text>
    </Screen>
  );
}

export function NewConversationScreen({ base }: { base: Base }) {
  const { spacing } = useTheme();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('GENERAL');
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () => careApi.createConversation({ subject: subject.trim(), category, initialMessage: body.trim() }),
    onSuccess: (r) => router.replace(`${base}/${r.conversation.id}`),
  });
  return (
    <Screen keyboard>
      <Header back title="Message your care team" subtitle="For non-urgent questions. Replies may take time." />
      <TextField label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. Question about my dressing" />
      <Text variant="label" style={{ marginBottom: spacing.sm }}>
        Topic
      </Text>
      <ChoiceChips label="Topic" value={category} onChange={setCategory} options={MESSAGE_CATEGORIES.filter((c) => c !== 'OTHER').map((c) => ({ value: c, label: humanize(c) }))} />
      <View style={{ height: spacing.lg }} />
      <TextField label="Message" value={body} onChangeText={setBody} multiline />
      {create.error ? <Banner tone="danger" title="Could not send" message={errorMessage(create.error)} /> : null}
      <Button title="Send" icon="send" style={{ marginTop: spacing.md }} disabled={subject.trim().length < 1 || body.trim().length < 1} loading={create.isPending} onPress={() => create.mutate()} />
    </Screen>
  );
}

export function ConversationScreen({ allowCallback = true }: { allowCallback?: boolean }) {
  const { colors, spacing, radius, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuth((s) => s.user?.id);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);
  const q = useQuery({ queryKey: careKeys.messages(id), queryFn: () => careApi.messages(id), enabled: !!id, refetchInterval: 30_000 });
  const key = useMemo(() => ({ current: newIdempotencyKey('msg') }), []);
  const send = useMutation({
    mutationFn: (type: 'TEXT' | 'CALLBACK_REQUEST') => careApi.sendMessage(id, { body: type === 'CALLBACK_REQUEST' ? 'Please call me back when you can.' : text.trim(), type, idempotencyKey: key.current }),
    onSuccess: () => {
      setText('');
      key.current = newIdempotencyKey('msg');
      void qc.invalidateQueries({ queryKey: careKeys.messages(id) });
      void qc.invalidateQueries({ queryKey: careKeys.conversations });
    },
  });

  const messages = q.data?.messages ?? [];
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Header back title={q.data?.conversation.subject ?? 'Conversation'} subtitle={q.data ? humanize(q.data.conversation.category) : undefined} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {q.isLoading ? (
          <View style={{ padding: spacing.lg }}>
            <LoadingCards count={2} />
          </View>
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.senderId?.id === me;
              return (
                <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  {!mine ? (
                    <Text variant="caption" tone="secondary" style={{ marginBottom: 2, marginLeft: 4 }}>
                      {fullName(item.senderId)} · {humanize(item.senderKind)}
                    </Text>
                  ) : null}
                  <View style={{ backgroundColor: mine ? colors.primary : colors.surface, borderRadius: radius.lg, borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4, padding: spacing.md, borderWidth: mine ? 0 : 1, borderColor: colors.border }}>
                    {item.type === 'CALLBACK_REQUEST' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Ionicons name="call" size={14} color={mine ? colors.textOnPrimary : colors.primary} />
                        <Text variant="caption" style={{ color: mine ? colors.textOnPrimary : colors.primary }}>
                          Call-back requested
                        </Text>
                      </View>
                    ) : null}
                    <Text variant="body" style={{ color: mine ? colors.textOnPrimary : colors.text }}>
                      {item.body}
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 2, marginHorizontal: 4 }}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
              );
            }}
          />
        )}
        {send.error ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <Text variant="caption" tone="danger">
              {errorMessage(send.error)}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          {allowCallback ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Request a call back" onPress={() => send.mutate('CALLBACK_REQUEST')} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}>
              <Ionicons name="call-outline" size={22} color={colors.primary} />
            </Pressable>
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message"
            placeholderTextColor={colors.textMuted}
            multiline
            accessibilityLabel="Message"
            style={[typography.body, { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 12, color: colors.text, backgroundColor: colors.background }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!text.trim() || send.isPending} onPress={() => send.mutate('TEXT')} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? colors.primary : colors.border }}>
            <Ionicons name="send" size={20} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function NotificationsScreen() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: careKeys.notifications, queryFn: careApi.notifications });
  const markAll = useMutation({ mutationFn: careApi.markNotificationsRead, onSuccess: () => void qc.invalidateQueries({ queryKey: careKeys.notifications }) });
  const staff = useAuth((s) => s.actingAs === 'STAFF');
  const open = (data?: Record<string, string>) => {
    if (!data) return;
    if (data.alertId && staff) router.push(`/(staff)/alerts/${data.alertId}`);
    else if (data.conversationId) router.push(staff ? `/(staff)/messages/${data.conversationId}` : `/(patient)/messages/${data.conversationId}`);
    else if (data.appointmentId && !staff) router.push(`/(patient)/appointments/${data.appointmentId}`);
    else if (data.taskId && !staff) router.push('/(patient)/tasks');
  };
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Notifications" right={q.data?.meta.unread ? <Button title="Mark all read" variant="ghost" size="sm" fullWidth={false} onPress={() => markAll.mutate()} /> : undefined} />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="notifications-outline" title="You're all caught up" message="Reminders and updates from your hospital will appear here." />
      ) : (
        <Card>
          {q.data.items.map((n) => (
            <ListRow key={n.id} icon={n.readAt ? 'notifications-outline' : 'notifications'} title={n.title} subtitle={`${n.body} · ${relativeTime(n.createdAt)}`} onPress={n.data && Object.keys(n.data).length ? () => open(n.data) : undefined} />
          ))}
        </Card>
      )}
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}
