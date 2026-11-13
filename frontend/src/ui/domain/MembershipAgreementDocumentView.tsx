import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  isDocumentActionCancellation,
  membershipAgreementHtml,
  printDocumentHtml,
  saveOrShareDocumentPdf,
} from "./document-printing";

function isSectionHeading(line: string): boolean {
  return [
    "included benefits",
    "restrictions",
    "participating stores",
    "organization membership terms and conditions",
    "membership terms and conditions",
  ].includes(line.trim().toLowerCase());
}
function renderAgreementLines(agreementText: string) {
  const lines = agreementText.split(/\r?\n/).map((line) => line.trimEnd());

  return lines.map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <View key={`space-${index}`} style={{ height: 10 }} />;
    }

    if (index === 0 && trimmed === "MEMBERSHIP AGREEMENT") {
      return (
        <Text
          key={`title-${index}`}
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: "#111827",
            marginBottom: 4,
            letterSpacing: 0.4,
          }}
        >
          {trimmed}
        </Text>
      );
    }

    if (index === 1) {
      return (
        <Text
          key={`org-${index}`}
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: "#374151",
            marginBottom: 12,
          }}
        >
          {trimmed}
        </Text>
      );
    }

    if (isSectionHeading(trimmed)) {
      return (
        <View
          key={`section-${index}`}
          style={{ marginTop: 14, marginBottom: 8 }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: "#111827",
            }}
          >
            {trimmed}
          </Text>
          <View
            style={{
              marginTop: 6,
              height: 1,
              backgroundColor: "#E5E7EB",
            }}
          />
        </View>
      );
    }

    if (
      trimmed.startsWith("Membership:") ||
      trimmed.startsWith("Plan:") ||
      trimmed.startsWith("Purchase price:") ||
      trimmed.startsWith("Duration:")
    ) {
      const [label, ...rest] = trimmed.split(":");
      return (
        <Text
          key={`meta-${index}`}
          style={{
            fontSize: 14,
            color: "#1F2937",
            lineHeight: 22,
            marginBottom: 4,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{label}:</Text>
          <Text> {rest.join(":").trim()}</Text>
        </Text>
      );
    }

    if (trimmed.startsWith("- ")) {
      return (
        <View
          key={`bullet-${index}`}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <Text
            style={{
              width: 14,
              fontSize: 14,
              lineHeight: 22,
              color: "#1F2937",
            }}
          >
            •
          </Text>
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              lineHeight: 22,
              color: "#1F2937",
            }}
          >
            {trimmed.substring(2)}
          </Text>
        </View>
      );
    }

    return (
      <Text
        key={`text-${index}`}
        style={{
          fontSize: 14,
          lineHeight: 22,
          color: "#1F2937",
          marginBottom: 6,
        }}
      >
        {trimmed}
      </Text>
    );
  });
}

export function MembershipAgreementDocumentView({
  agreementText,
  onClose,
}: {
  agreementText: string;
  onClose?: () => void;
}) {
  const [documentAction, setDocumentAction] = React.useState<
    "print" | "pdf" | null
  >(null);
  const [documentError, setDocumentError] = React.useState<string | null>(null);

  const runDocumentAction = async (action: "print" | "pdf") => {
    if (documentAction) return;
    setDocumentAction(action);
    setDocumentError(null);
    try {
      const html = membershipAgreementHtml(agreementText);
      if (action === "print") await printDocumentHtml(html);
      else await saveOrShareDocumentPdf(html);
    } catch (error) {
      if (!isDocumentActionCancellation(error)) {
        setDocumentError(
          error instanceof Error
            ? error.message
            : "Unable to prepare this agreement document.",
        );
      }
    } finally {
      setDocumentAction(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F3F4F6" }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
          backgroundColor: "#FFFFFF",
          gap: 14,
        }}
      >
        {/* Agreement heading */}
        <View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: "#111827",
            }}
          >
            Membership Agreement
          </Text>

          <Text
            style={{
              marginTop: 4,
              fontSize: 13,
              color: "#6B7280",
            }}
          >
            Customer copy
          </Text>
        </View>

        {/* Document actions */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Pressable
            accessibilityRole="button"
            disabled={documentAction !== null}
            onPress={() => void runDocumentAction("print")}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: "#111827",
              opacity: documentAction !== null ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>
              {documentAction === "print" ? "Preparing..." : "Print"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={documentAction !== null}
            onPress={() => void runDocumentAction("pdf")}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#D1D5DB",
              backgroundColor: "#FFFFFF",
              opacity: documentAction !== null ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#111827", fontWeight: "600" }}>
              {documentAction === "pdf" ? "Preparing..." : "Save / Share PDF"}
            </Text>
          </Pressable>

          {onClose ? (
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#D1D5DB",
                backgroundColor: "#FFFFFF",
              }}
            >
              <Text style={{ color: "#111827", fontWeight: "600" }}>Close</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {documentError ? (
        <Text
          style={{
            paddingHorizontal: 20,
            paddingTop: 10,
            color: "#B91C1C",
            fontSize: 13,
          }}
        >
          {documentError}
        </Text>
      ) : null}

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 900,
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            padding: 24,
          }}
        >
          {renderAgreementLines(agreementText)}
        </View>
      </ScrollView>
    </View>
  );
}
