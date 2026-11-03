import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Share, TextInput, View } from "react-native";
import type { MembershipProduct } from "@/src/core";
import { services } from "@/src/core";
import { useBusiness } from "@/src/providers";
import { Button, Card, ReferenceSelect, Text } from "@/src/ui";
import { QrPlaceholder } from "@/src/ui/domain/QrPlaceholder";
import {
  marketingQrSvg,
  marketingQrUrl,
  type MarketingQrKind,
} from "@/src/core/qr/marketing-qr";

const kinds: { id: MarketingQrKind; name: string }[] = [
  { id: "ORGANIZATION", name: "Store / promotion — all memberships" },
  { id: "MEMBERSHIP", name: "Specific membership" },
];

const customerWebUrl = process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL?.trim();

function browserOrigin(): string | null {
  return Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : null;
}

function isPublicHttpsOrigin(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1" &&
      !/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function downloadSvg(svg: string, fileName: string): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPng(svg: string, fileName: string): Promise<void> {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const sourceUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to render QR poster."));
      image.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 3;
    canvas.height = image.naturalHeight * 3;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas export unavailable.");
    ctx.scale(3, 3);
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("PNG export failed.")),
        "image/png",
      );
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function printSvg(svg: string): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Enable pop-ups to print the QR poster.");
  popup.document.open();
  popup.document.write(
    `<!doctype html><html><head><title>Memgine Marketing QR</title>` +
      `<style>body{margin:0;min-height:100vh;display:grid;place-items:center}` +
      `svg{max-width:95vw;max-height:95vh}@page{margin:10mm}</style></head>` +
      `<body>${svg.replace(/^<\?xml[^>]*\?>\s*/, "")}` +
      `<script>window.onload=function(){window.print();};<\/script></body></html>`,
  );
  popup.document.close();
}

type GeneratedPoster = {
  destination: string;
  title: string;
  tagline: string;
  headline: string;
  callToAction: string;
  kind: MarketingQrKind;
  productId: string;
};

export default function OrgAdminMarketingQr() {
  const { organization } = useBusiness();
  const [kind, setKind] = useState<MarketingQrKind>("ORGANIZATION");
  const [productId, setProductId] = useState("");
  const [products, setProducts] = useState<MembershipProduct[]>([]);
  const [posterTitle, setPosterTitle] = useState(
    organization.displayName || organization.name,
  );
  const [tagline, setTagline] = useState("");
  const [headline, setHeadline] = useState(
    "Discover our exclusive memberships",
  );
  const [callToAction, setCallToAction] = useState("Scan to explore and join");
  const [generated, setGenerated] = useState<GeneratedPoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setGenerated(null);
    setProducts([]);
    setPosterTitle(organization.displayName || organization.name);
    setTagline("");
    void services.customerData
      .discoverOrganizationDetail(organization.id)
      .then((result) => {
        if (!active) return;
        setProducts(result.membershipProducts as MembershipProduct[]);
        setTagline(
          result.publishedExperience.organizationBranding?.tagline ?? "",
        );
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load the published membership catalogue.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organization.id]);

  const selectedProduct = products.find((item) => item.id === productId);
  const base = customerWebUrl || browserOrigin();
  const validOrigin = isPublicHttpsOrigin(base);

  const invalidate = () => {
    setGenerated(null);
    setNotice(null);
    setError(null);
  };

  const generate = () => {
    invalidate();
    try {
      if (loading) throw new Error("The published catalogue is still loading.");
      if (!validOrigin)
        throw new Error(
          "Configure a public HTTPS customer website URL before generating QR codes.",
        );
      if (!posterTitle.trim()) throw new Error("Poster title is required.");
      if (kind === "MEMBERSHIP" && !selectedProduct) {
        throw new Error("Select a published membership.");
      }
      if (kind === "ORGANIZATION" && products.length === 0) {
        throw new Error("There are no published memberships to promote.");
      }

      const destination = marketingQrUrl(
        base,
        organization.id,
        kind,
        kind === "MEMBERSHIP" ? selectedProduct?.id : undefined,
      );
      const snapshot: GeneratedPoster = {
        destination,
        title: posterTitle.trim(),
        tagline: tagline.trim(),
        headline:
          headline.trim() ||
          (kind === "MEMBERSHIP"
            ? `Join ${selectedProduct?.displayName || selectedProduct?.membershipProductName}`
            : "Discover our memberships"),
        callToAction: callToAction.trim() || "Scan to explore and join",
        kind,
        productId: kind === "MEMBERSHIP" ? selectedProduct!.id : "",
      };
      // Validate the QR encoder and poster before showing any action buttons.
      marketingQrSvg(
        snapshot.destination,
        snapshot.title,
        snapshot.tagline,
        snapshot.headline,
        snapshot.callToAction,
      );
      setGenerated(snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate QR code.");
    }
  };

  const svg = useMemo(
    () =>
      generated
        ? marketingQrSvg(
            generated.destination,
            generated.title,
            generated.tagline,
            generated.headline,
            generated.callToAction,
          )
        : null,
    [generated],
  );

  const fileName = generated
    ? `memgine-${organization.id}-${
        generated.kind === "ORGANIZATION"
          ? "all-memberships"
          : generated.productId
      }-qr.svg`.replace(/[^a-zA-Z0-9_.-]/g, "-")
    : "";

  const shareLink = async () => {
    if (!generated) return;
    setError(null);
    try {
      const message = `${generated.title}\n${generated.headline}\n${generated.destination}`;
      if (Platform.OS === "web" && typeof navigator !== "undefined") {
        if (navigator.share) {
          await navigator.share({
            title: generated.title,
            text: generated.headline,
            url: generated.destination,
          });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(message);
          setNotice("Promotional link copied.");
        } else {
          throw new Error("Sharing is unavailable in this browser.");
        }
      } else {
        await Share.share({ message });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Unable to share link.");
      }
    }
  };

  const renderField = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    multiline = false,
  ) => (
    <View style={{ gap: 6 }}>
      <Text variant="bodySmall">{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => {
          onChange(next);
          invalidate();
        }}
        multiline={multiline}
        numberOfLines={multiline ? 2 : 1}
        maxLength={150}
        style={{
          minHeight: multiline ? 76 : 46,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#CBD5E1",
          backgroundColor: "#FFFFFF",
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: "#172033",
          fontSize: 15,
          textAlignVertical: "top",
        }}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 920 }}>
      <Text variant="title">Marketing QR Code Generator</Text>
      <Text variant="bodySmall" color="textMuted">
        Customize a reusable promotional poster, then click Generate QR Code.
        These QR codes link to the public published membership purchase journey,
        not to a payment intent or a redemption token.
      </Text>

      <Card padding="lg">
        <View style={{ gap: 16 }}>
          <ReferenceSelect
            label="QR code for"
            value={kind}
            items={kinds}
            onChange={(value) => {
              setKind(value as MarketingQrKind);
              setProductId("");
              invalidate();
            }}
          />
          {kind === "MEMBERSHIP" ? (
            <ReferenceSelect
              label="Published membership"
              value={productId}
              items={products}
              getItemId={(item) => item.id}
              renderItemLabel={(item) =>
                `${item.displayName || item.membershipProductName} (${item.membershipProductCode})`
              }
              onChange={(value) => {
                setProductId(value);
                invalidate();
              }}
              placeholder="Choose membership"
              disabled={loading}
              required
            />
          ) : null}

          {renderField(
            "Poster title / Organization name",
            posterTitle,
            setPosterTitle,
          )}
          {renderField(
            "Tagline (editable for this poster only)",
            tagline,
            setTagline,
            true,
          )}
          {renderField("Promotional headline", headline, setHeadline)}
          {renderField("Call to action", callToAction, setCallToAction)}

          {loading ? (
            <Text variant="bodySmall">Loading published memberships…</Text>
          ) : null}
          {!loading && products.length === 0 ? (
            <Text variant="bodySmall" color="textMuted">
              No published memberships available. Publish Customer Experience
              first.
            </Text>
          ) : null}
          {!validOrigin ? (
            <Text variant="bodySmall" color="danger">
              Set EXPO_PUBLIC_CUSTOMER_WEB_URL to the public HTTPS customer
              website.
            </Text>
          ) : null}
          {error ? (
            <Text variant="bodySmall" color="danger">
              {error}
            </Text>
          ) : null}
          {notice ? <Text variant="bodySmall">{notice}</Text> : null}
          <Button
            label="Generate QR Code"
            onPress={generate}
            disabled={loading || !validOrigin || products.length === 0}
          />
        </View>
      </Card>

      {generated && svg ? (
        <Card padding="lg">
          <View style={{ alignItems: "center", gap: 12 }}>
            <Text variant="title">{generated.title}</Text>
            {generated.tagline ? (
              <Text variant="bodySmall">{generated.tagline}</Text>
            ) : null}
            <Text variant="body">{generated.headline}</Text>
            <QrPlaceholder
              size={260}
              value={generated.destination}
              testID="marketing-qr-preview"
            />
            <Text variant="bodySmall">{generated.callToAction}</Text>
            <Text variant="bodySmall" color="textMuted">
              Powered by Memgine
            </Text>
            <Text variant="bodySmall" color="textMuted">
              {generated.destination}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
              paddingTop: 18,
            }}
          >
            {Platform.OS === "web" ? (
              <>
                <Button
                  label="Download SVG poster"
                  onPress={() => downloadSvg(svg, fileName)}
                />
                <Button
                  label="Download PNG"
                  variant="secondary"
                  onPress={() => {
                    void downloadPng(
                      svg,
                      fileName.replace(/\.svg$/, ".png"),
                    ).catch((e) =>
                      setError(
                        e instanceof Error ? e.message : "PNG export failed.",
                      ),
                    );
                  }}
                />
                <Button
                  label="Print poster"
                  variant="secondary"
                  onPress={() => {
                    try {
                      printSvg(svg);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Print failed.",
                      );
                    }
                  }}
                />
              </>
            ) : null}
            <Button
              label="Share purchase link"
              variant="secondary"
              onPress={() => void shareLink()}
            />
          </View>
        </Card>
      ) : (
        <Card padding="md">
          <Text variant="bodySmall" color="textMuted">
            Configure the poster fields and click Generate QR Code to preview
            and export it.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}
