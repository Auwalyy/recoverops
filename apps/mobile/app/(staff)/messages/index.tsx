import { ConversationListScreen } from '@/screens/shared/MessagingScreens';

export default function StaffMessages() {
  return <ConversationListScreen base="/(staff)/messages" canStart={false} title="Messages" />;
}
