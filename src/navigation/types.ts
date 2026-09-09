export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  ProfileSetup: undefined;
  Main: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
