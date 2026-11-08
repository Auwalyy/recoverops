/* global jest */
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k);
    }),
    __store: store,
  };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
// Minimal Reanimated mock covering the APIs RecoverOS uses (the package's own mock
// loads native worklet initialisers that cannot run under Jest).
jest.mock('react-native-reanimated', () => {
  const { View, Text, ScrollView } = require('react-native');
  const anim = { delay: () => anim, duration: () => anim, springify: () => anim };
  const Animated = { View, Text, ScrollView, createAnimatedComponent: (c) => c };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: (fn) => fn(),
    withTiming: (v) => v,
    withRepeat: (v) => v,
    withSpring: (v) => v,
    Easing: { inOut: () => (t) => t, out: () => (t) => t, ease: (t) => t, cubic: (t) => t },
    FadeIn: anim,
    FadeInDown: anim,
    FadeOut: anim,
  };
});
jest.mock('react-native-worklets', () => ({}));
