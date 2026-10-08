import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { Screen } from "@/src/layout";
import {
  AuthRequestError,
  useAuth,
  useCustomerContext,
  useTheme,
  useTranslation,
} from "@/src/providers";
import {
  Button,
  Card,
  Checkbox,
  Header,
  ListRow,
  Modal,
  Section,
  StateView,
  Text,
} from "@/src/ui";
import { CustomerNotificationBell } from "@/src/ui/domain/CustomerNotificationBell";

const MEMGINE_WEBSITE = "https://mynikatech.in";
const PRIVACY_URL = "https://mynikatech.in/memgine/privacy";
const TERMS_URL = "https://mynikatech.in/memgine/terms";
const SUPPORT_URL = "https://mynikatech.in/memgine/support";
const SUPPORT_EMAIL = "support@mynikatech.in";

export default function Profile() {
  const router = useRouter();
  const theme = useTheme();
  const { t, locale, currency, timezone } = useTranslation();

  const {
    customerId,
    profiles,
    customersLoading,
    customersError,
    refreshCustomers,
  } = useCustomerContext();

  const {
    session,
    logout,
    customerAccountDeletionPreview,
    deleteCustomerAccount,
  } = useAuth();

  const [aboutVisible, setAboutVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [deleteAccountStep, setDeleteAccountStep] = useState<
    "impact" | "identity" | "final"
  >("impact");
  const [deleteAccountSubmitting, setDeleteAccountSubmitting] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(
    null,
  );
  const [activeSubscriptionCount, setActiveSubscriptionCount] = useState(0);
  const [deleteAccountPreviewLoaded, setDeleteAccountPreviewLoaded] =
    useState(false);
  const [acknowledgeActiveSubscriptions, setAcknowledgeActiveSubscriptions] =
    useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);

  const relationships = profiles.filter((row) => row.userId === customerId);
  const customer = relationships[0];

  const name =
    customer?.displayName?.trim() ||
    session?.displayName?.trim() ||
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim();

  const initial = (name || "?").charAt(0).toUpperCase();

  const languageLabel = locale.toLowerCase().startsWith("en")
    ? t("profile.languageEnglish")
    : locale;

  const regionLabel = `${currency} · ${timezone}`;

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Keep the user in the app if the destination cannot be opened.
    }
  };

  const openSupportEmail = async () => {
    await openUrl(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        "Memgine Support",
      )}`,
    );
  };

  const confirmSignOut = async () => {
    setSignOutVisible(false);
    await logout();
    router.replace(APP_ROUTES.customerLogin as never);
  };

  const closeDeleteAccount = () => {
    if (deleteAccountSubmitting) return;
    setDeleteAccountVisible(false);
    setDeleteAccountStep("impact");
    setDeleteAccountError(null);
    setActiveSubscriptionCount(0);
    setDeleteAccountPreviewLoaded(false);
    setAcknowledgeActiveSubscriptions(false);
  };

  const openDeleteAccount = async () => {
    setDeleteAccountStep("impact");
    setDeleteAccountError(null);
    setActiveSubscriptionCount(0);
    setDeleteAccountPreviewLoaded(false);
    setAcknowledgeActiveSubscriptions(false);
    setDeleteAccountVisible(true);
    try {
      const preview = await customerAccountDeletionPreview();
      setActiveSubscriptionCount(preview.activeSubscriptionCount);
      setDeleteAccountPreviewLoaded(true);
    } catch (error) {
      setDeleteAccountError(
        error instanceof Error
          ? error.message
          : "Your account details could not be checked. Please try again.",
      );
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleteAccountSubmitting(true);
    setDeleteAccountError(null);
    try {
      await deleteCustomerAccount(acknowledgeActiveSubscriptions);
      setDeleteAccountVisible(false);
      setDeleteAccountStep("impact");
      router.replace(APP_ROUTES.customerLogin as never);
    } catch (error) {
      if (
        error instanceof AuthRequestError &&
        error.code === "ACTIVE_SUBSCRIPTIONS_ACK_REQUIRED"
      ) {
        try {
          const preview = await customerAccountDeletionPreview();
          setActiveSubscriptionCount(preview.activeSubscriptionCount);
          setDeleteAccountPreviewLoaded(true);
          setAcknowledgeActiveSubscriptions(false);
          setDeleteAccountStep("final");
          setDeleteAccountError(null);
        } catch (previewError) {
          setDeleteAccountError(
            previewError instanceof Error
              ? previewError.message
              : "Your active memberships could not be checked. Please try again.",
          );
        }
        return;
      }
      setDeleteAccountError(
        error instanceof Error
          ? error.message
          : "Your account could not be deleted. Please try again.",
      );
    } finally {
      setDeleteAccountSubmitting(false);
    }
  };

  return (
    <Screen
      testID="customer-profile-screen"
      edges={["top"]}
      header={
        <Header
          title={t("profile.title")}
          subtitle={t("profile.subtitle")}
          right={<CustomerNotificationBell />}
          testID="profile-header"
        />
      }
    >
      {customersLoading ? (
        <StateView kind="loading" message={t("common.loading")} />
      ) : null}

      {customersError ? (
        <StateView
          kind="error"
          title={t("common.error")}
          message={customersError}
          actionLabel={t("common.retry")}
          onAction={() => void refreshCustomers()}
        />
      ) : null}

      {/* PROFILE HERO */}
      <Card padding="lg" testID="profile-identity">
        <View style={{ gap: theme.spacing.md }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.md,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text variant="h2" color="primary">
                {initial}
              </Text>
            </View>

            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="title" color="text">
                {name || "—"}
              </Text>

              {customer?.primaryEmail ? (
                <Text variant="bodySmall" color="textMuted">
                  {customer.primaryEmail}
                </Text>
              ) : null}

              {customer?.primaryPhone ? (
                <Text variant="bodySmall" color="textMuted">
                  {customer.primaryPhone}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
            }}
          />

          <Text variant="caption" color="textMuted">
            Your Memgine profile connects your memberships across participating
            businesses.
          </Text>
        </View>
      </Card>

      {/* PREFERENCES */}
      <Section title={t("profile.preferences")} testID="profile-preferences">
        <Card padding="md">
          {/* <ListRow
            label={t("profile.language")}
            value={languageLabel}
            icon="language-outline"
            showChevron={false}
            testID="profile-language"
          />*/}

          <ListRow
            label={t("profile.region")}
            value={regionLabel}
            icon="globe-outline"
            showChevron={false}
            testID="profile-region"
          />
        </Card>
      </Section>

      {/* MEMGINE */}
      <Section title="Memgine" testID="profile-memgine">
        <Card padding="md">
          <ListRow
            label={t("profile.about")}
            icon="information-circle-outline"
            onPress={() => setAboutVisible(true)}
            testID="profile-about"
          />

          <ListRow
            label="Privacy Policy"
            icon="shield-checkmark-outline"
            onPress={() => setPrivacyVisible(true)}
            testID="profile-privacy"
          />

          <ListRow
            label="Terms of Use"
            icon="document-text-outline"
            onPress={() => setTermsVisible(true)}
            testID="profile-terms"
          />

          <ListRow
            label="Help & Support"
            icon="help-circle-outline"
            onPress={() => setSupportVisible(true)}
            testID="profile-support"
          />
        </Card>
      </Section>

      {/* ACCOUNT */}
      <Section title={t("profile.account")} testID="profile-account">
        <Card padding="md">
          <ListRow
            label="Delete Account"
            icon="trash-outline"
            onPress={() => void openDeleteAccount()}
            testID="profile-delete-account"
          />

          <ListRow
            label="Sign out"
            icon="log-out-outline"
            onPress={() => setSignOutVisible(true)}
            testID="profile-sign-out"
          />
        </Card>
      </Section>

      {/* ABOUT */}
      <Modal
        visible={aboutVisible}
        onClose={() => setAboutVisible(false)}
        title="About Memgine"
        testID="profile-about-modal"
      >
        <View style={{ gap: theme.spacing.lg }}>
          <View
            style={{
              alignItems: "center",
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <Image
              source={require("../../assets/images/memgine-icon.png")}
              style={{
                width: 82,
                height: 82,
                borderRadius: 20,
              }}
              resizeMode="contain"
            />

            <Text variant="h2" color="text">
              Memgine
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Memberships made simple.
            </Text>
          </View>

          <Card padding="lg">
            <Text variant="body" color="text" style={{ textAlign: "center" }}>
              Memgine helps you discover and manage memberships, access
              exclusive benefits and offers, and redeem eligible rewards — all
              in one place.
            </Text>
          </Card>

          {activeSubscriptionCount > 0 ? (
            <Card padding="lg">
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="bodyStrong" color="danger">
                  You currently have {activeSubscriptionCount} active membership
                  {activeSubscriptionCount === 1 ? "" : "s"}.
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  Deleting your Memgine account will remove your access to
                  Memgine, but it will not cancel, refund, or erase your active
                  memberships. Membership and transaction records will remain
                  with the participating business.
                </Text>
              </View>
            </Card>
          ) : null}

          <View style={{ gap: theme.spacing.md }}>
            <FeatureRow
              icon="card-outline"
              title="Digital Memberships"
              description="Discover, purchase and manage memberships from participating businesses."
              theme={theme}
            />

            <FeatureRow
              icon="gift-outline"
              title="Benefits"
              description="Access exclusive benefits included with your memberships."
              theme={theme}
            />

            <FeatureRow
              icon="pricetags-outline"
              title="Offers & Promotions"
              description="Discover offers and promotions from your favorite businesses."
              theme={theme}
            />

            <FeatureRow
              icon="qr-code-outline"
              title="Easy Redemption"
              description="Generate secure QR codes and redeem eligible benefits and offers in-store."
              theme={theme}
            />
          </View>

          <Pressable
            onPress={() => void openUrl(MEMGINE_WEBSITE)}
            style={({ pressed }) => ({
              alignItems: "center",
              paddingVertical: theme.spacing.sm,
              opacity: pressed ? theme.states.pressedOpacity : 1,
            })}
          >
            <Text variant="bodySmall" color="primary">
              Visit mynikatech.in
            </Text>
          </Pressable>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              alignItems: "center",
            }}
          >
            <Text variant="caption" color="textMuted">
              Your memberships. Your benefits. One place.
            </Text>
          </View>
        </View>
      </Modal>

      {/* PRIVACY */}
      <Modal
        visible={privacyVisible}
        onClose={() => setPrivacyVisible(false)}
        title="Privacy Policy"
        testID="profile-privacy-modal"
      >
        <View style={{ gap: theme.spacing.lg }}>
          <LegalHero
            icon="shield-checkmark-outline"
            title="Your privacy matters"
            description="We believe your personal information should be handled responsibly and transparently."
            theme={theme}
          />

          <LegalInfoCard
            icon="person-outline"
            title="Information we use"
            description="Information needed to operate your account and memberships may include your name, contact information, membership activity, purchases and redemption history."
            theme={theme}
          />

          <LegalInfoCard
            icon="settings-outline"
            title="How it is used"
            description="Your information is used to provide Memgine services, manage memberships and transactions, support your account and maintain platform security."
            theme={theme}
          />

          <LegalInfoCard
            icon="lock-closed-outline"
            title="Protecting your information"
            description="We use appropriate technical and organizational safeguards designed to protect personal information handled through Memgine."
            theme={theme}
          />

          <Button
            label="Read Full Privacy Policy"
            onPress={() => void openUrl(PRIVACY_URL)}
          />

          <Pressable
            onPress={() => void openUrl(MEMGINE_WEBSITE)}
            style={{ alignItems: "center" }}
          >
            <Text variant="caption" color="textMuted">
              mynikatech.in
            </Text>
          </Pressable>
        </View>
      </Modal>

      {/* TERMS */}
      <Modal
        visible={termsVisible}
        onClose={() => setTermsVisible(false)}
        title="Terms of Use"
        testID="profile-terms-modal"
      >
        <View style={{ gap: theme.spacing.lg }}>
          <LegalHero
            icon="document-text-outline"
            title="Clear terms. Simple memberships."
            description="These terms explain how Memgine can be used and how memberships offered by participating businesses work."
            theme={theme}
          />

          <LegalInfoCard
            icon="phone-portrait-outline"
            title="Using Memgine"
            description="Memgine provides digital access to memberships, benefits, offers, promotions and redemption experiences."
            theme={theme}
          />

          <LegalInfoCard
            icon="storefront-outline"
            title="Business-specific terms"
            description="Membership pricing, validity, benefits, offer conditions, availability and redemption requirements may differ between participating businesses."
            theme={theme}
          />

          <LegalInfoCard
            icon="checkmark-circle-outline"
            title="Before you purchase"
            description="Review the applicable membership details, pricing and conditions before completing a purchase or redemption."
            theme={theme}
          />

          <Button
            label="Read Full Terms of Use"
            onPress={() => void openUrl(TERMS_URL)}
          />

          <Pressable
            onPress={() => void openUrl(MEMGINE_WEBSITE)}
            style={{ alignItems: "center" }}
          >
            <Text variant="caption" color="textMuted">
              mynikatech.in
            </Text>
          </Pressable>
        </View>
      </Modal>

      {/* SUPPORT */}
      <Modal
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
        title="Help & Support"
        testID="profile-support-modal"
      >
        <View style={{ gap: theme.spacing.lg }}>
          <LegalHero
            icon="mail-outline"
            title="We're here to help"
            description="If you need assistance with Memgine, your account or a technical issue, contact our support team."
            theme={theme}
          />

          <Card padding="lg">
            <View style={{ gap: theme.spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing.md,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: theme.colors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="mail-outline"
                    size={22}
                    color={theme.colors.primary}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color="text">
                    Email Support
                  </Text>

                  <Text variant="bodySmall" color="primary">
                    {SUPPORT_EMAIL}
                  </Text>
                </View>
              </View>

              <Button
                label="Email Support"
                onPress={() => void openSupportEmail()}
              />
            </View>
          </Card>

          <Card padding="lg">
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="bodyStrong" color="text">
                Membership questions
              </Text>

              <Text variant="bodySmall" color="textMuted">
                For questions about a particular business's membership,
                benefits, offer conditions or redemption eligibility, please
                contact that business directly.
              </Text>
            </View>
          </Card>

          <Button
            label="Visit Support Website"
            variant="secondary"
            onPress={() => void openUrl(SUPPORT_URL)}
          />

          {/*<Text
            variant="caption"
            color="textMuted"
            style={{ textAlign: "center" }}
          >
            No phone support is currently provided.
          </Text>*/}
        </View>
      </Modal>

      {/* DELETE ACCOUNT */}
      <Modal
        visible={deleteAccountVisible}
        onClose={closeDeleteAccount}
        title="Delete Account"
        testID="profile-delete-account-modal"
      >
        <View style={{ gap: theme.spacing.lg }}>
          <View
            style={{
              alignItems: "center",
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <View
              style={{
                width: 70,
                height: 70,
                borderRadius: 24,
                backgroundColor: theme.colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="trash-outline"
                size={32}
                color={theme.colors.danger}
              />
            </View>

            <Text variant="title" color="text" style={{ textAlign: "center" }}>
              Delete your Memgine account?
            </Text>

            <Text
              variant="bodySmall"
              color="textMuted"
              style={{ textAlign: "center" }}
            >
              Account deletion is permanent and cannot be undone.
            </Text>
          </View>

          <Card padding="lg">
            <View style={{ gap: theme.spacing.md }}>
              <DeleteImpactRow
                icon="person-remove-outline"
                text="Your Memgine profile and account access will be removed."
                theme={theme}
              />

              <DeleteImpactRow
                icon="card-outline"
                text="You will lose access to memberships associated with this account."
                theme={theme}
              />

              <DeleteImpactRow
                icon="receipt-outline"
                text="Certain transaction records may be retained where required for legal, accounting, fraud-prevention or regulatory purposes."
                theme={theme}
              />
            </View>
          </Card>

          {deleteAccountStep === "impact" ? (
            <>
              <Text
                variant="bodySmall"
                color="textMuted"
                style={{ textAlign: "center" }}
              >
                Continue to confirm that you are deleting this signed-in
                Memgine account.
              </Text>
              <Button
                label="Continue to Account Deletion"
                onPress={() => setDeleteAccountStep("identity")}
                disabled={!deleteAccountPreviewLoaded}
              />
            </>
          ) : null}

          {deleteAccountStep === "identity" ? (
            <>
              <Card padding="md">
                <Text variant="bodySmall" color="textMuted">
                  You are signed in as {name || session?.displayName || "this account"}.
                  Your active session confirms your identity for this request.
                </Text>
              </Card>
              <Button label="Continue" onPress={() => setDeleteAccountStep("final")} />
            </>
          ) : null}

          {deleteAccountStep === "final" ? (
            <>
              <Text
                variant="bodySmall"
                color="danger"
                style={{ textAlign: "center" }}
              >
                This permanently removes your account access. This action cannot
                be undone.
              </Text>
              {deleteAccountError ? (
                <Text variant="bodySmall" color="danger">
                  {deleteAccountError}
                </Text>
              ) : null}
              {activeSubscriptionCount > 0 ? (
                <Checkbox
                  value={acknowledgeActiveSubscriptions}
                  onValueChange={setAcknowledgeActiveSubscriptions}
                  label="I understand that deleting my Memgine account does not cancel my active memberships."
                  disabled={deleteAccountSubmitting}
                  testID="profile-delete-account-active-subscriptions-acknowledgement"
                />
              ) : null}
              <Button
                label={deleteAccountSubmitting ? "Deleting..." : "Delete My Account"}
                variant="primary"
                disabled={
                  deleteAccountSubmitting ||
                  (activeSubscriptionCount > 0 && !acknowledgeActiveSubscriptions)
                }
                onPress={() => void confirmDeleteAccount()}
              />
            </>
          ) : null}

          <Button
            label="Keep My Account"
            variant="secondary"
            disabled={deleteAccountSubmitting}
            onPress={closeDeleteAccount}
          />
        </View>
      </Modal>

      {/* SIGN OUT CONFIRMATION */}
      <Modal
        visible={signOutVisible}
        onClose={() => setSignOutVisible(false)}
        title="Sign out"
        testID="profile-sign-out-modal"
      >
        <View style={{ gap: theme.spacing.lg }}>
          <View
            style={{
              alignItems: "center",
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="log-out-outline"
                size={30}
                color={theme.colors.primary}
              />
            </View>

            <Text variant="title" color="text">
              Sign out of Memgine?
            </Text>

            <Text
              variant="bodySmall"
              color="textMuted"
              style={{ textAlign: "center" }}
            >
              You will need to sign in again to access your memberships,
              benefits and offers.
            </Text>
          </View>

          <Button label="Sign out" onPress={() => void confirmSignOut()} />

          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setSignOutVisible(false)}
          />
        </View>
      </Modal>
    </Screen>
  );
}

function FeatureRow({
  icon,
  title,
  description,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.spacing.md,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: theme.colors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={21} color={theme.colors.primary} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color="text">
          {title}
        </Text>

        <Text variant="bodySmall" color="textMuted">
          {description}
        </Text>
      </View>
    </View>
  );
}

function LegalHero({
  icon,
  title,
  description,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 70,
          height: 70,
          borderRadius: 24,
          backgroundColor: theme.colors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={32} color={theme.colors.primary} />
      </View>

      <Text variant="title" color="text" style={{ textAlign: "center" }}>
        {title}
      </Text>

      <Text
        variant="bodySmall"
        color="textMuted"
        style={{ textAlign: "center" }}
      >
        {description}
      </Text>
    </View>
  );
}

function LegalInfoCard({
  icon,
  title,
  description,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Card padding="lg">
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: theme.colors.primarySoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={20} color={theme.colors.primary} />
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong" color="text">
            {title}
          </Text>

          <Text variant="bodySmall" color="textMuted">
            {description}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function DeleteImpactRow({
  icon,
  text,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: theme.spacing.md,
      }}
    >
      <Ionicons name={icon} size={20} color={theme.colors.textMuted} />

      <Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
