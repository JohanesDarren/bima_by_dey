import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useChatStore } from '../store/chatStore';
import { BrowseScreen } from '../screens/BrowseScreen';
import { CookingScreen } from '../screens/CookingScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { RecipeDetailScreen } from '../screens/RecipeDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

/**
 * Root navigation.
 *
 * Flow (PRD §8.1):
 *  1. Splash while the Supabase session / MMKV state bootstraps.
 *  2. While signed in, hydrate the demographic profile before routing.
 *  3. Signed in & hydrated → ProfileSetup (first run, no demographics yet)
 *     or Main chat. Signed out → Login.
 */
export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isGuest = useAuthStore((s) => s.isGuest);
  const userId = useAuthStore((s) => s.user?.id);
  const hydrated = useProfileStore((s) => s.hydrated);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const hydrateGuestHistory = useChatStore((s) => s.hydrateGuestHistory);

  const signedIn = status === 'signedIn';

  // Boot auth session/guest state exactly once on mount.
  useEffect(() => {
    if (!bootstrapped) {
      bootstrap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped]);

  // After auth resolves to guest, restore guest chat history from disk.
  useEffect(() => {
    if (bootstrapped && isGuest) {
      hydrateGuestHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, isGuest]);

  // Once auth resolves, hydrate the profile before choosing the route.
  useEffect(() => {
    if (bootstrapped && signedIn && !hydrated) {
      fetchProfile(userId ?? 'guest');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, signedIn, hydrated, userId, isGuest]);

  if (!bootstrapped) return <SplashScreen />;
  // Wait for profile hydration (auth + guest) before mounting the navigator.
  if (signedIn && !hydrated) return <LoadingScreen />;

  const initialRoute = !signedIn ? 'Login' : 'Browse';

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName={initialRoute as keyof RootStackParamList}
        screenOptions={{ headerShown: false }}
      >
        {signedIn ? (
          <>
            <Stack.Screen name="Browse" component={BrowseScreen} />
            <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
            <Stack.Screen name="Cooking" component={CookingScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
