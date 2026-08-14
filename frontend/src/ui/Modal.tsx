import { ReactNode } from "react";
import { Modal as RNModal, Pressable, ScrollView, View } from "react-native";

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
};

/** Dialog foundation — themed sheet with backdrop; optional scrollable body. */
export function Modal({
  visible,
  onClose,
  title,
  children,
  scrollable = false,
  testID,
}: ModalProps) {
  const theme = useTheme();

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
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: "center",
          padding: theme.spacing.lg,
        }}
      >
        <Pressable
          testID={testID}
          onPress={() => {}}
          style={[
            {
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
              maxHeight: "88%",
              width: "100%",
              maxWidth: 520,
              alignSelf: "center",
            },
            theme.shadows.lg,
          ]}
        >
          {header}
          {scrollable ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
