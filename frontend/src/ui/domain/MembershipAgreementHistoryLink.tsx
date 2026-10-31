import { useState } from "react";
import { Modal, Pressable, Text } from "react-native";
import { MembershipAgreementDocumentView } from "./MembershipAgreementDocumentView";

/** One purchase's immutable agreement text (never live organization terms). */
export function MembershipAgreementHistoryLink({
  agreementText,
}: {
  agreementText?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!agreementText) return null;

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text
          style={{
            color: "#1767A7",
            textDecorationLine: "underline",
            fontWeight: "600",
          }}
        >
          View Membership Agreement
        </Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <MembershipAgreementDocumentView
          agreementText={agreementText}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
