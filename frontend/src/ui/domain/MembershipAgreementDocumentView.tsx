import React from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

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
  const printDocument = () => {
    if (Platform.OS !== "web") return;
    window.print();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F3F4F6" }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
          backgroundColor: "#FFFFFF",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
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

        <View style={{ flexDirection: "row", gap: 10 }}>
          {Platform.OS === "web" ? (
            <Pressable
              accessibilityRole="button"
              onPress={printDocument}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: "#111827",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>Print</Text>
            </Pressable>
          ) : null}

          {onClose ? (
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
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
