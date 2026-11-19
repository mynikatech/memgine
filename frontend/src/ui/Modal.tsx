import { ReactNode, useCallback, useEffect, useRef } from "react";
import {
  KeyboardAvoidingView,
  Keyboard,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import { useTheme } from "@/src/providers";

import { IconButton } from "./IconButton";
import { Text } from "./Text";

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  scrollable?: boolean;
  testID?: string;
  maxWidth?: number;
  scrollFocusedInput?: boolean;
};

/** Dialog foundation — themed sheet with backdrop; optional scrollable body. */
export function Modal({
  visible,
  onClose,
  title,
  children,
  scrollable = false,
  testID,
  maxWidth = 520,
  scrollFocusedInput = false,
}: ModalProps) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  const scrollFrame = useRef<number | undefined>(undefined);

  const revealFocusedInput = useCallback(() => {
    if (!visible || !scrollable || !scrollFocusedInput || Platform.OS === "web") return;
    if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = undefined;
      const input = TextInput.State.currentlyFocusedInput();
      if (input) scroll.current?.scrollResponderScrollNativeHandleToKeyboard(input, theme.spacing.md, true);
    });
  }, [visible, scrollable, scrollFocusedInput, theme.spacing.md]);

  useEffect(() => {
    if (!visible || !scrollable || !scrollFocusedInput || Platform.OS === "web") return;
    const listener = Keyboard.addListener("keyboardDidShow", revealFocusedInput);
    return () => {
      listener.remove();
      if (scrollFrame.current !== undefined) {
        cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = undefined;
      }
    };
  }, [visible, scrollable, scrollFocusedInput, revealFocusedInput]);

  const header = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: theme.spacing.md,
      }}
    >
      <Text variant="title" color="text">
        {title}
      </Text>
      <IconButton
        icon="close"
        color="textMuted"
        onPress={onClose}
        testID={testID ? `${testID}-close` : undefined}
      />
    </View>
  );

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.overlay,
            justifyContent: "center",
            padding: theme.spacing.lg,
          }}
        >
          <View
            testID={testID}
            style={[
              {
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
                maxHeight: "88%",
                width: "100%",
                maxWidth,
                alignSelf: "center",
              },
              theme.shadows.lg,
            ]}
          >
            {header}
            {scrollable ? (
              <ScrollView
                ref={scroll}
                onFocus={scrollFocusedInput && Platform.OS !== "web" ? () => {
                  if (Keyboard.isVisible()) revealFocusedInput();
                } : undefined}
                style={{ flexShrink: 1 }}
                contentContainerStyle={{
                  paddingBottom: theme.spacing.xxl,
                }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}
