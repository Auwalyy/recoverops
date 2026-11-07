import { ConversationListScreen } from '@/screens/shared/MessagingScreens';
import { hasPermission, useAuth } from '@/store/auth';

export default function CaregiverMessages() {
  const canSend = useAuth((s) => hasPermission(s.user, 'messages.send'));
  return <ConversationListScreen base="/(caregiver)/messages" canStart={canSend} />;
}
