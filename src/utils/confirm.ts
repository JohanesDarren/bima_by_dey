import { Alert, Platform } from 'react-native';

/**
 * Konfirmasi lintas platform:
 * - native → Alert.alert
 * - web → window.confirm (Alert.alert tidak render di react-native-web)
 * Mengembalikan true jika user menekan "OK/Confirm".
 */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'OK',
  cancelLabel = 'Batal',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
