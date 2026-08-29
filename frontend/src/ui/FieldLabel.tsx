import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

type FieldLabelProps = {
  label: string;
  required?: boolean;
};

export function FieldLabel({ label, required = false }: FieldLabelProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        minHeight: 22,
      }}
    >
      <Text variant="bodySmall" color="text">
        {label}
      </Text>

      {required ? (
        <Text
          variant="bodyStrong"
          color="danger"
          style={{
            fontSize: 17,
            lineHeight: 20,
            fontWeight: "700",
          }}
        >
          *
        </Text>
      ) : null}
    </View>
  );
}
