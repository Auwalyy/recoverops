import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { lightColors } from '@/theme/tokens';
import { Text } from '@/components/ui';

/** Branded splash shown while the secure session is restored. */
export function SplashView() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.05, { duration: 900 }), -1, true);
  }, [scale]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View accessibilityLabel="RecoverOS is loading" style={{ flex: 1, backgroundColor: lightColors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={anim}>
        <Image source={require('../../../assets/splash-icon.png')} style={{ width: 120, height: 120 }} />
      </Animated.View>
      <Animated.View entering={FadeIn.delay(200)}>
        <Text variant="title" style={{ color: '#FFFFFF', marginTop: 20, letterSpacing: 0.5 }}>
          RecoverOS
        </Text>
        <Text variant="bodySmall" align="center" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
          Recovery, coordinated.
        </Text>
      </Animated.View>
    </View>
  );
}
