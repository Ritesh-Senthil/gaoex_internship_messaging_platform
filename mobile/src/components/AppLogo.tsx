/**
 * App brand mark used on login and profile surfaces.
 */

import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const logoSource = require('../../assets/icon.png');

type AppLogoProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export default function AppLogo({ size = 96, style }: AppLogoProps) {
  return (
    <Image
      source={logoSource}
      accessibilityLabel="GAOEX Connect"
      style={[
        styles.logo,
        { width: size, height: size, borderRadius: size * 0.22 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    resizeMode: 'cover',
  },
});
