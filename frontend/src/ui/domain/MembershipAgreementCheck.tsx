import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { MembershipAgreementDocumentView } from "./MembershipAgreementDocumentView";

/** Presentational control only; backend must independently enforce acceptance. */
export function MembershipAgreementCheck({
  agreementText,
  accepted,
  onAcceptedChange,
}: {
  agreementText: string;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const [visible, setVisible] = useState(false);
  const ready = agreementText.trim().length > 0;

  return (
    <View style={{ gap: 10, paddingVertical: 12 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        disabled={!ready}
      >
        <Text
          style={{
            color: ready ? "#1767A7" : "#777",
            textDecorationLine: "underline",
            fontWeight: "600",
          }}
        >
          {ready
            ? "Read Membership Agreement"
            : "Membership agreement unavailable"}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted, disabled: !ready }}
        disabled={!ready}
        onPress={() => onAcceptedChange(!accepted)}
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <Text style={{ fontSize: 21 }}>{accepted ? "☑" : "☐"}</Text>
        <Text style={{ flex: 1, color: "#111827" }}>
          I have read and agree to this Membership Agreement.
        </Text>
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <MembershipAgreementDocumentView
          agreementText={agreementText}
          onClose={() => setVisible(false)}
        />
      </Modal>
    </View>
  );
}
