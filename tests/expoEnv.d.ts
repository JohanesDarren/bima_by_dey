// Tipe minimal `process.env` (EXPO_PUBLIC_*) untuk module yang dikompilasi di luar Expo.
declare const process: { env: Record<string, string | undefined> };
