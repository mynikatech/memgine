import { ReactNode } from "react";
import { ScrollView, StyleProp, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/business";

/**
 * Screen shell — themed, safe-area-aware content container. Top inset is
 * handled by the navigator header; this adds page padding + bottom inset.
 */
type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Screen({ children, scroll = true, contentStyle, testID }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const padding = { padding: spacing.md, paddingBottom: spacing.md + insets.bottom };

  if (!scroll) {
    return (
      <View testID={testID} style={[{ flex: 1, backgroundColor: colors.background }, padding, contentStyle]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[padding, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
