import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type {
  Benefit,
  MembershipProduct,
  Offer,
  Redemption,
  Store,
  Subscription,
  TemplateDefaultContent,
} from "@/src/core";
import { useBusiness, useTranslation } from "@/src/providers";
import { Badge, Button, Card, Modal, Section, Text } from "@/src/ui";
import {
  ActivityItem,
  benefitIconForType,
  BenefitItem,
  MembershipCard,
  OfferCard,
  QrPlaceholder,
} from "@/src/ui/domain";

import { ExperienceTabKey, resolveExperience } from "./resolve-experience";

/**
 * BusinessExperience — the reusable, config-driven renderer for the F&B
 * template. Fed a business's content + a customer's subscription/domain data,
 * it renders a branded, tabbed experience (Card / Offers / History / Profile)
 * bounded by the TemplateDefinition. It contains NO business-specific values.
 */
type Props = {
  content: TemplateDefaultContent;
  subscription: Subscription;
  product: MembershipProduct;
  benefits: Benefit[];
  offers: Offer[];
  stores: Store[];
  redemptions: Redemption[];
  onExit: () => void;
};

export function BusinessExperience({
  content,
  subscription,
  product,
  benefits,
  offers,
  stores,
  redemptions,
  onExit,
}: Props) {
  const { organization, configuration, template, theme } = useBusiness();
  const { t, formatDate } = useTranslation();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<ExperienceTabKey>("card");
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);

  const exp = useMemo(
    () =>
      resolveExperience({
        organization,
        configuration,
        template,
        content,
        subscription,
        product,
        benefits,
        offers,
        stores,
        redemptions,
        formatDate,
      }),
    [organization, configuration, template, content, subscription, product, benefits, offers, stores, redemptions, formatDate],
  );

  const cardStyle = configuration.customerExperience.cardStyle;

  /* ------------------------------ sub-renderers ------------------------------ */

  const HeroImage = ({ uri, height = 168 }: { uri?: string; height?: number }) =>
    uri ? (
      <Image
        source={{ uri }}
        resizeMode="cover"
        style={{ width: "100%", height, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceAlt }}
      />
    ) : null;

  const renderPromotionCard = (
    promo: NonNullable<typeof exp.heroPromotion>,
    withRedeem?: boolean,
  ) => (
    <Card padding="none" style={{ overflow: "hidden" }}>
      <HeroImage uri={promo.imageUrl} />
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {promo.badge ? <Badge label={promo.badge} tone="brand" /> : <View />}
          {promo.expiryLabel ? (
            <Text variant="caption" color="textMuted">
              {promo.expiryLabel}
            </Text>
          ) : null}
        </View>
        <Text variant="h2" color="text">
          {promo.title}
        </Text>
        <Text variant="bodySmall" color="textSecondary">
          {promo.description}
        </Text>
        {withRedeem ? (
          <Button
            label={t("experience.redeemNow")}
            onPress={() => setRedeemOpen(true)}
            testID="experience-promo-redeem"
          />
        ) : null}
      </View>
    </Card>
  );

  const CardTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-card">
      {exp.heroPromotion ? renderPromotionCard(exp.heroPromotion) : null}

      <Section title={t("experience.yourMembership")}>
        <MembershipCard
          testID="experience-membership-card"
          organizationName={exp.displayName}
          tier={exp.membership.tier}
          validUntil={exp.membership.validUntilLabel}
          active={exp.membership.active}
          cardStyle={cardStyle}
        />
        <Card padding="lg" style={{ marginTop: theme.spacing.md }}>
          <View style={{ alignItems: "center", gap: theme.spacing.md }}>
            <QrPlaceholder size={148} testID="experience-qr" />
            <View style={{ alignItems: "center" }}>
              <Text variant="caption" color="textMuted">
                {t("experience.memberId")}
              </Text>
              <Text variant="bodyStrong" color="text">
                {exp.membership.memberId}
              </Text>
            </View>
            <Text variant="bodySmall" color="textMuted">
              {t("experience.showAtCounter")}
            </Text>
            <Button
              label={t("experience.redeemNow")}
              fullWidth
              onPress={() => setRedeemOpen(true)}
              testID="experience-redeem"
            />
          </View>
        </Card>
      </Section>

      {exp.benefits.length ? (
        <Section title={t("experience.yourBenefits")}>
          <Card padding="lg">
            <View style={{ gap: 18 }}>
              {exp.benefits.map((b) => (
                <BenefitItem
                  key={b.id}
                  testID={`experience-benefit-${b.id}`}
                  title={b.title}
                  subtitle={b.description}
                  icon={benefitIconForType(b.type)}
                />
              ))}
            </View>
          </Card>
        </Section>
      ) : null}
    </View>
  );

  const OffersTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-offers">
      <Section title={t("experience.todaysPerks")}>
        {exp.featuredPromotion ? renderPromotionCard(exp.featuredPromotion, true) : null}
        <View style={{ gap: theme.spacing.md, marginTop: exp.featuredPromotion ? theme.spacing.md : 0 }}>
          {exp.offers.map((o) => (
            <OfferCard
              key={o.id}
              testID={`experience-offer-${o.id}`}
              title={o.title}
              description={o.description}
              badge={o.badge}
            />
          ))}
        </View>
      </Section>
    </View>
  );

  const HistoryTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-history">
      <Card padding="lg">
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="display" color="primary">
              {exp.activityCount}
            </Text>
            <Text variant="caption" color="textMuted">
              {t("experience.redemptionsLabel")}
            </Text>
          </View>
          {exp.mostVisited ? (
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text variant="bodyStrong" color="text" style={{ textAlign: "right" }}>
                {exp.mostVisited}
              </Text>
              <Text variant="caption" color="textMuted">
                {t("experience.mostVisited")}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Section title={t("experience.tabHistory")}>
        {exp.activity.length ? (
          <Card padding="lg">
            <View style={{ gap: 18 }}>
              {exp.activity.map((a) => (
                <View
                  key={a.id}
                  testID={`experience-activity-${a.id}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}
                >
                  <View style={{ flex: 1 }}>
                    <ActivityItem title={a.title} subtitle={`${a.location} · ${a.timeLabel}`} />
                  </View>
                  <Badge label={t("experience.redeemed")} tone="success" />
                </View>
              ))}
            </View>
          </Card>
        ) : (
          <Card padding="lg">
            <Text variant="bodySmall" color="textMuted">
              {t("experience.historyEmpty")}
            </Text>
          </Card>
        )}
      </Section>
    </View>
  );

  const ProfileTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-profile">
      {exp.showStores && exp.stores.length ? (
        <Section title={t("experience.locations")}>
          <Card padding="lg">
            <View style={{ gap: 18 }}>
              {exp.stores.map((s) => (
                <View
                  key={s.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}
                >
                  <Ionicons name="location-outline" size={20} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" color="text">
                      {s.name}
                    </Text>
                    <Text variant="bodySmall" color="textMuted">
                      {s.address.line1}
                      {s.address.city ? `, ${s.address.city}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {exp.businessInformation ? (
        <Section title={t("experience.about")}>
          <Card padding="lg">
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="body" color="textSecondary">
                {exp.businessInformation.about}
              </Text>
              <InfoRow icon="mail-outline" label={t("experience.email")} value={exp.businessInformation.supportEmail} theme={theme} />
              <InfoRow icon="call-outline" label={t("experience.phone")} value={exp.businessInformation.supportPhone} theme={theme} />
              <InfoRow icon="globe-outline" label={t("experience.website")} value={exp.businessInformation.website} theme={theme} />
            </View>
          </Card>
        </Section>
      ) : null}

      {exp.businessPreferences ? (
        <Section title={t("experience.preferences")}>
          <Card padding="lg">
            <View style={{ gap: theme.spacing.md }}>
              <PrefRow label={t("experience.notifications")} on={exp.businessPreferences.notifications} t={t} theme={theme} />
              <PrefRow label={t("experience.marketingEmails")} on={exp.businessPreferences.marketingEmails} t={t} theme={theme} />
            </View>
          </Card>
        </Section>
      ) : null}

      {exp.referral ? (
        <Card padding="lg">
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="title" color="text">
              {exp.referral.headline}
            </Text>
            <Text variant="bodySmall" color="textMuted">
              {exp.referral.description}
            </Text>
            <Button
              label={t("experience.referral")}
              variant="secondary"
              onPress={() => setReferralOpen(true)}
              testID="experience-referral"
            />
          </View>
        </Card>
      ) : null}
    </View>
  );

  const tabContent =
    tab === "card" ? CardTab : tab === "offers" ? OffersTab : tab === "history" ? HistoryTab : ProfileTab;

  /* --------------------------------- layout --------------------------------- */

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      {/* Platform return action — the ONLY Memgine chrome inside a business. */}
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        <Pressable
          onPress={onExit}
          testID="experience-back"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            alignSelf: "flex-start",
            paddingVertical: 6,
            opacity: pressed ? theme.states.pressedOpacity : 1,
          })}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
          <Text variant="label" color="primary">
            {t("experience.back")}
          </Text>
        </Pressable>
      </View>

      {/* Persistent branded identity header. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="title" color="onPrimary">
            {exp.monogram}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h2" color="text">
            {exp.displayName}
          </Text>
          <Text variant="caption" color="textMuted">
            {exp.tagline}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {tabContent}
      </ScrollView>

      {/* Subtle platform footer. */}
      <View
        style={{
          alignItems: "center",
          paddingVertical: 6,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="caption" color="textMuted">
          {t("experience.poweredBy")}
        </Text>
      </View>

      {/* Business navigation — config-driven bottom tabs. */}
      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          paddingBottom: insets.bottom,
        }}
      >
        {exp.tabs.map((tb) => {
          const focused = tb.key === tab;
          return (
            <Pressable
              key={tb.key}
              testID={`experience-tabbar-${tb.key}`}
              onPress={() => setTab(tb.key)}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, gap: 2 }}
            >
              <Ionicons
                name={(focused ? tb.icon : tb.iconOutline) as keyof typeof Ionicons.glyphMap}
                size={22}
                color={focused ? theme.colors.primary : theme.colors.textMuted}
              />
              <Text variant="caption" color={focused ? "primary" : "textMuted"}>
                {t(tb.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Redeem — MODAL presentation (visual only; no real redemption). */}
      <Modal
        visible={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        title={t("experience.redeemNow")}
        testID="experience-redeem-modal"
      >
        <View style={{ alignItems: "center", gap: theme.spacing.md }}>
          <QrPlaceholder size={200} />
          <View style={{ alignItems: "center" }}>
            <Text variant="caption" color="textMuted">
              {t("experience.memberId")}
            </Text>
            <Text variant="title" color="text">
              {exp.membership.memberId}
            </Text>
          </View>
          <Text variant="bodySmall" color="textMuted">
            {t("experience.showAtCounter")}
          </Text>
        </View>
      </Modal>

      {/* Referral — MODAL presentation. */}
      <Modal
        visible={referralOpen}
        onClose={() => setReferralOpen(false)}
        title={exp.referral?.headline ?? t("experience.referral")}
        testID="experience-referral-modal"
      >
        {exp.referral ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="body" color="textSecondary">
              {exp.referral.description}
            </Text>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Text variant="caption" color="textMuted">
                {t("experience.referralCode")}
              </Text>
              <Badge label={exp.referral.code} tone="brand" />
            </View>
            <Text variant="bodySmall" color="primary" style={{ textAlign: "center" }}>
              {exp.referral.rewardLabel}
            </Text>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

/* --------------------------- tiny local helpers --------------------------- */

function InfoRow({
  icon,
  label,
  value,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  theme: ReturnType<typeof useBusiness>["theme"];
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
      <Ionicons name={icon} size={18} color={theme.colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="bodySmall" color="text">
          {value}
        </Text>
      </View>
    </View>
  );
}

function PrefRow({
  label,
  on,
  t,
  theme,
}: {
  label: string;
  on: boolean;
  t: (path: string) => string;
  theme: ReturnType<typeof useBusiness>["theme"];
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="bodySmall" color="text">
        {label}
      </Text>
      <View
        style={{
          backgroundColor: on ? theme.colors.successSoft : theme.colors.surfaceAlt,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: theme.radius.pill,
        }}
      >
        <Text variant="caption" color={on ? "success" : "textMuted"}>
          {on ? t("experience.on") : t("experience.off")}
        </Text>
      </View>
    </View>
  );
}
