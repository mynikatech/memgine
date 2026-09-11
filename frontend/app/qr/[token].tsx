import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { QRScanResult, services } from "@/src/core";
import { LocalQRResolutionService } from "@/src/core/services/qr-resolution-service";
import { APP_ROUTES } from "@/src/constants/navigation";
import { Screen } from "@/src/layout";
import { useTranslation } from "@/src/providers";
import { Button, Card, StateView, Text } from "@/src/ui";

const qrResolutionService = new LocalQRResolutionService(
  services.qrCode,
  services.qrScanHistory,
);

export default function QRResolutionScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    token?: string | string[];
  }>();

  const { t } = useTranslation();

  const token = useMemo(() => {
    if (Array.isArray(params.token)) {
      return params.token[0]?.trim() ?? "";
    }

    return params.token?.trim() ?? "";
  }, [params.token]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let mounted = true;

    const resolve = async () => {
      if (!token) {
        if (mounted) {
          setLoading(false);
          setError("This QR code is invalid.");
        }

        return;
      }

      try {
        setLoading(true);
        setError(undefined);

        const resolution = await qrResolutionService.resolveByToken(token);

        if (!mounted) {
          return;
        }

        /*
         * Record the scan after resolving the persisted QR definition.
         *
         * The QR route is currently a customer/public entry point,
         * so scanSource identifies this channel without inventing
         * a customer or staff identity.
         */
        await qrResolutionService.recordScan(
          resolution.qrCode,
          resolution.result,
          {
            scanSource: "QR_WEB",
          },
          resolution.result === QRScanResult.SUCCESS
            ? undefined
            : resolution.reason,
        );

        if (!mounted) {
          return;
        }

        if (resolution.result !== QRScanResult.SUCCESS) {
          setLoading(false);
          setError(resolution.reason);
          return;
        }

        const journey =
          await qrResolutionService.resolveBusinessMembershipByToken(token);

        if (!mounted) {
          return;
        }

        /*
         * QR_BUSINESS_MEMBERSHIPS represents the organization's
         * membership catalogue.
         *
         * If a specific membership product was encoded as the target,
         * preserve it. Otherwise JoinFlow will use the first available
         * membership product for the organization, which is already
         * supported by the existing JoinFlow implementation.
         */
        if (journey.membershipProductId) {
          router.replace({
            pathname: APP_ROUTES.join.root,
            params: {
              organizationId: journey.organizationId,
              productId: journey.membershipProductId,
              source: "QR",
            },
          });
        } else {
          router.replace({
            pathname: APP_ROUTES.join.root,
            params: {
              organizationId: journey.organizationId,
              source: "QR",
            },
          });
        }
      } catch (resolutionError) {
        console.error("QR RESOLUTION ERROR", resolutionError);

        if (!mounted) {
          return;
        }

        /*
         * The persisted QR record may exist even when journey resolution
         * fails. We intentionally do not create a second history record
         * here because the normal resolution path already records the
         * resolved outcome.
         */
        setLoading(false);

        setError(
          resolutionError instanceof Error
            ? resolutionError.message
            : "Unable to open this QR code.",
        );
      }
    };

    resolve();

    return () => {
      mounted = false;
    };
  }, [router, token]);

  if (loading) {
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 16,
          }}
        >
          <ActivityIndicator />

          <Text variant="body">Opening this QR code…</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Card>
            <View style={{ gap: 16 }}>
              <Text variant="title">QR code unavailable</Text>

              <Text variant="body">{error}</Text>

              <Button label="Go back" onPress={() => router.back()} />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  /*
   * Normally the screen is replaced by JoinFlow before this point.
   * This fallback prevents an empty screen if navigation is interrupted.
   */
  return (
    <Screen>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Card>
          <View style={{ gap: 16 }}>
            <Text variant="title">QR code opened</Text>

            <Text variant="body">
              Continue to view the available memberships.
            </Text>
            <Button
              label="Continue"
              onPress={() => router.replace(APP_ROUTES.join.root)}
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
