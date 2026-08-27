import { View } from "react-native";

import { Text } from "./Text";

type FieldLabelProps = {
  label: string;
  required?: boolean;
};

export function FieldLabel({ label, required = false }: FieldLabelProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Text variant="label" color="textSecondary">
        {label}
      </Text>

      {required ? (
        <Text variant="label" color="danger" accessibilityLabel="required">
          *
        </Text>
      ) : null}
    </View>
  );
}
