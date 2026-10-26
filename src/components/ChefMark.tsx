import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  CHEF_CHARACTER_SVG,
  CHEF_SPOON_BOX,
  CHEF_SPOON_SVG,
  CHEF_STILL_SVG,
  CHEF_VIEWBOX,
} from '../brand/chefMark';

interface Props {
  /** Rendered square size in px. */
  size?: number;
  /** Draw the soft halo + ground shadow behind the character. */
  halo?: boolean;
  accessibilityLabel?: string;
}

/**
 * The static sorgumcore chef mark — the app's logo.
 *
 * Drawn from the same markup as `ChefLoader` and the launcher icon, so the
 * character the user sees on their home screen is the one inside the app.
 *
 * `halo={false}` drops the backdrop and the spoon's separate layer, which is what
 * small avatars want: at 30-40px the halo just muddies the circle behind it.
 */
export function ChefMark({
  size = 96,
  halo = true,
  accessibilityLabel = 'Maskot koki sorgumcore',
}: Props) {
  if (!halo) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={{ width: size, height: size }}
      >
        <SvgXml xml={CHEF_CHARACTER_SVG} viewBox={CHEF_VIEWBOX} width={size} height={size} />
      </View>
    );
  }

  const spoonSize = (CHEF_SPOON_BOX.size / 100) * size;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size }}
    >
      <SvgXml xml={CHEF_STILL_SVG} viewBox={CHEF_VIEWBOX} width={size} height={size} />
      <SvgXml
        xml={CHEF_SPOON_SVG}
        viewBox={CHEF_VIEWBOX}
        width={spoonSize}
        height={spoonSize}
        style={[
          styles.spoon,
          {
            left: (CHEF_SPOON_BOX.x / 100) * size,
            top: (CHEF_SPOON_BOX.y / 100) * size,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  spoon: { position: 'absolute' },
});
