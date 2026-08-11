import { ReactNode } from "react";
import { Modal as RNModal, Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";

import { IconButton } from "./IconButton";
import { Text } from "./Text";

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  testID?: string;
};

/** Dialog foundation — centered themed sheet with backdrop. */
export function Modal({ visible, onClose, title, children, testID }: ModalProps) {
  const theme = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            },
            theme.shadows.lg,
          ]}
        >
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
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
