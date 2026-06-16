const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fixes CocoaPods static-library builds for Google/Firebase Swift pods
 * (AppCheckCore → GoogleUtilities) by enabling modular headers globally.
 */
function withIosModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /^(platform :ios[^\n]*\n)/m,
          '$1use_modular_headers!\n',
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return cfg;
    },
  ]);
}

module.exports = withIosModularHeaders;
