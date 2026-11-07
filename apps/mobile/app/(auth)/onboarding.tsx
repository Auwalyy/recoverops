import { useRef, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { usePreferences } from '@/store/preferences';

const SLIDES = [
  { icon: 'clipboard-outline' as const, title: 'Your recovery plan, in your pocket', body: 'See the instructions your care team approved, your medicines and what to do today — even without internet.' },
  { icon: 'pulse-outline' as const, title: 'Tell your care team how you feel', body: 'Short daily check-ins help your hospital notice problems early and contact you when needed.' },
  { icon: 'people-outline' as const, title: 'Connected to your hospital', body: 'Message your care team, manage appointments, and choose which family members can help you.' },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const { colors, spacing, radius } = useTheme();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const finish = () => {
    usePreferences.getState().markOnboardingSeen();
    router.replace('/(auth)/login');
  };
  const last = index === SLIDES.length - 1;

  return (
    <Screen scroll={false} padded={false} edges={['top', 'bottom']}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg }}>
        <Button title="Skip" variant="ghost" size="sm" fullWidth={false} onPress={finish} />
      </View>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: spacing.xxl, justifyContent: 'center', alignItems: 'center' }}>
            <Animated.View entering={FadeInDown.duration(500)} style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xxxl }}>
              <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={item.icon} size={52} color={colors.primary} />
              </View>
            </Animated.View>
            <Text variant="display" align="center">
              {item.title}
            </Text>
            <Text variant="body" tone="secondary" align="center" style={{ marginTop: spacing.md, maxWidth: 340 }}>
              {item.body}
            </Text>
          </View>
        )}
      />
      <View style={{ padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={{ width: i === index ? 24 : 8, height: 8, borderRadius: radius.pill, backgroundColor: i === index ? colors.primary : colors.border }} />
          ))}
        </View>
        <Button
          title={last ? 'Get started' : 'Next'}
          onPress={() => {
            if (last) return finish();
            listRef.current?.scrollToIndex({ index: index + 1 });
            setIndex(index + 1);
          }}
        />
      </View>
    </Screen>
  );
}
