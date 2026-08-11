import { ReactNode } from "react";
import { ScrollView, StyleProp, View, ViewStyle } from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/providers";

/**
 * Screen — cross-platform screen primitive. Themed background, safe-area aware,
 * optional sticky header region and scrollable padded body. Works for the
 * Customer (mobile-first) and Staff (desktop) shells alike.
 */
type ScreenProps = {
  children: ReactNode;
  header?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Screen({
  children,
  header,
  scroll = true,
  padded = true,
  edges = ["top", "bottom"],
  contentStyle,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const pad = padded ? { padding: theme.spacing.lg } : undefined;

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[pad, { gap: theme.spacing.lg }, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, gap: theme.spacing.lg }, pad, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      {header ? <View style={{ paddingHorizontal: theme.spacing.lg }}>{header}</View> : null}
      {body}
    </SafeAreaView>
  );
}
