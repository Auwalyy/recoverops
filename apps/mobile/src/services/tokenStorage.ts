import * as SecureStore from 'expo-secure-store';

/**
 * Tokens live in the platform keystore (Android Keystore / iOS Keychain) via
 * expo-secure-store. The access token is also cached in memory for synchronous use.
 */
const ACCESS = 'recoveros.accessToken';
const REFRESH = 'recoveros.refreshToken';
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let accessToken: string | null = null;

export const tokenStorage = {
  getAccessToken: () => accessToken,
  async load(): Promise<{ access: string | null; refresh: string | null }> {
    const [access, refresh] = await Promise.all([SecureStore.getItemAsync(ACCESS, OPTS), SecureStore.getItemAsync(REFRESH, OPTS)]);
    accessToken = access;
    return { access, refresh };
  },
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH, OPTS),
  async setTokens(access: string, refresh: string) {
    accessToken = access;
    await Promise.all([SecureStore.setItemAsync(ACCESS, access, OPTS), SecureStore.setItemAsync(REFRESH, refresh, OPTS)]);
  },
  async setAccessToken(access: string) {
    accessToken = access;
    await SecureStore.setItemAsync(ACCESS, access, OPTS);
  },
  async clear() {
    accessToken = null;
    await Promise.all([SecureStore.deleteItemAsync(ACCESS, OPTS), SecureStore.deleteItemAsync(REFRESH, OPTS)]);
  },
};
