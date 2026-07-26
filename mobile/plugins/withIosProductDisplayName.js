/**
 * Sets iOS PRODUCT_NAME so the Google/ASWebAuthenticationSession
 * "… wants to use accounts.google.com" dialog keeps spaces in the app name.
 */
const { withXcodeProject } = require('@expo/config-plugins');

const DISPLAY_NAME = 'GAOEX Connect';

function withIosProductDisplayName(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (typeof entry !== 'object' || !entry.buildSettings) continue;
      const settings = entry.buildSettings;

      // Only touch app target configs that already define a product name / bundle id
      if (settings.PRODUCT_BUNDLE_IDENTIFIER || settings.PRODUCT_NAME) {
        settings.PRODUCT_NAME = `"${DISPLAY_NAME}"`;
        settings.INFOPLIST_KEY_CFBundleDisplayName = `"${DISPLAY_NAME}"`;
        settings.INFOPLIST_KEY_CFBundleName = `"${DISPLAY_NAME}"`;
      }
    }

    return config;
  });
}

module.exports = withIosProductDisplayName;
