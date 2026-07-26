/**
 * Keeps iOS PRODUCT_NAME as a CocoaPods-safe identifier, while forcing
 * CFBundleName / CFBundleDisplayName (used by Google sign-in prompts) to
 * the spaced brand name.
 */
const { withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

const DISPLAY_NAME = 'GAOEX Connect';
const SAFE_PRODUCT_NAME = 'InternHub';

function withIosProductDisplayName(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.CFBundleDisplayName = DISPLAY_NAME;
    config.modResults.CFBundleName = DISPLAY_NAME;
    return config;
  });

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (typeof entry !== 'object' || !entry.buildSettings) continue;
      const settings = entry.buildSettings;

      if (settings.PRODUCT_BUNDLE_IDENTIFIER || settings.PRODUCT_NAME) {
        // CocoaPods breaks if PRODUCT_NAME contains spaces
        settings.PRODUCT_NAME = SAFE_PRODUCT_NAME;
        settings.INFOPLIST_KEY_CFBundleDisplayName = `"${DISPLAY_NAME}"`;
        settings.INFOPLIST_KEY_CFBundleName = `"${DISPLAY_NAME}"`;
      }
    }

    return config;
  });

  return config;
}

module.exports = withIosProductDisplayName;
