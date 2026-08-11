import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Modal as RNModal, Pressable, Text, View } from "react-native";

import { useTheme } from "@/src/business";

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  testID?: string;
};

export function Modal({ visible, onClose, title, children, testID }: ModalProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          justifyContent: "center",
          padding: spacing.md,
        }}
      >
        <View
          testID={testID}
          style={{ backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.md }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
              {title}
            </Text>
            <Pressable testID={testID ? `${testID}-close` : undefined} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </RNModal>
  );
}
