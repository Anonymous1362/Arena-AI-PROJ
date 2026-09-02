const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Support package `exports` field (used by some modern dependencies)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
