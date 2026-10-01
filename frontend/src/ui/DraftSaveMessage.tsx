import { StyleSheet, View } from "react-native";

import { Text } from "@/src/ui";

type DraftSaveMessageProps = {
  visible: boolean;
};

export function DraftSaveMessage({ visible }: DraftSaveMessageProps) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text variant="bodySmall" color="textMuted">
        Saved as draft for this session. Click Save Changes to persist it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
