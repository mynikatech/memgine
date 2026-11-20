import { ReactNode } from "react";
import { Platform, ScrollView, StyleProp, View, ViewStyle } from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/providers";

/**
 * Screen — cross-platform screen primitive.
 * Themed background, safe-area aware, optional sticky header
 * and scrollable padded body.
 */
type ScreenProps = {
  children: ReactNode;
  header?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  keyboardAware?: boolean;
};

export function Screen({
  children,
  header,
  scroll = true,
  padded = true,
  edges = ["top", "bottom"],
  contentStyle,
  testID,
  keyboardAware = false,
}: ScreenProps) {
  const theme = useTheme();

  const pad = padded ? { padding: theme.spacing.lg } : undefined;

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        pad,
        { gap: theme.spacing.lg },
        contentStyle,
        keyboardAware ? { paddingBottom: theme.spacing.xxl * 3 } : undefined,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={keyboardAware ? "on-drag" : "none"}
      automaticallyAdjustKeyboardInsets={keyboardAware && Platform.OS === "ios"}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, gap: theme.spacing.lg }, pad, contentStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      {header ? (
        <View style={{ paddingHorizontal: theme.spacing.lg }}>{header}</View>
      ) : null}

      {body}
    </SafeAreaView>
  );
}
