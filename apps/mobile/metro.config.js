// Expo's default Metro config supports npm workspaces (resolves packages/shared).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
