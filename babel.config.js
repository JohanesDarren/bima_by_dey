module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4.x ships its Babel plugin via react-native-worklets.
    plugins: ['react-native-worklets/plugin'],
  };
};
