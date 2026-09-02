/**
 * Expo config shim: reads app.json and optionally injects a web basePath
 * (used by the GitHub Pages workflow, which serves under /<repo>/).
 * Local exports stay at root paths — set nothing and nothing changes.
 */
const appJson = require('./app.json');

module.exports = {
  ...appJson.expo,
  experiments: {
    ...appJson.expo.experiments,
    ...(process.env.WEB_BASE_PATH ? { basePath: process.env.WEB_BASE_PATH } : {}),
  },
};
