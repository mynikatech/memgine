import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  onboardOrganization,
  services,
  type ReferenceDataItem,
} from "@/src/core";

import { useBusiness, useTheme } from "@/src/providers";

import { Input, PhoneField, ReferenceSelect, Text, Checkbox } from "@/src/ui";

import type { PhoneValue } from "@/src/ui/PhoneField";

import { APP_ROUTES } from "@/src/constants/navigation";

export default function OrganizationNew() {
  const theme = useTheme();

  const { setActiveBusiness } = useBusiness();

  const [organizationTypes, setOrganizationTypes] = useState<
    ReferenceDataItem[]
  >([]);

  const [countries, setCountries] = useState<
    Awaited<ReturnType<typeof services.referenceData.listCountries>>
  >([]);

  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingCountries, setLoadingCountries] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [useDefaultBusinessContent, setUseDefaultBusinessContent] =
    useState(false);
  const [organizationTypeId, setOrganizationTypeId] = useState("");

  const [primaryEmail, setPrimaryEmail] = useState("");

  const [primaryPhone, setPrimaryPhone] = useState<PhoneValue>({
    countryId: "country-ca",
    callingCode: "+1",
    number: "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [nameTouched, setNameTouched] = useState(false);
  const [typeTouched, setTypeTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadReferenceData = async () => {
      try {
        setLoadingTypes(true);
        setLoadingCountries(true);

        const [types, countryList] = await Promise.all([
          services.referenceData.listOrganizationTypes(),
          services.referenceData.listCountries(),
        ]);

        if (!mounted) {
          return;
        }

        setOrganizationTypes(types.filter((item) => item.active));

        setCountries(countryList);

        /*
         * Canada is the agreed MVP default.
         *
         * If the reference data contains Canada, use its
         * actual ID and calling code rather than relying
         * solely on hard-coded values.
         */
        const canada = countryList.find(
          (country) =>
            country.countryCode === "CA" || country.id === "country-ca",
        );

        if (canada) {
          setPrimaryPhone((current) => ({
            ...current,
            countryId: canada.id,
            callingCode: canada.callingCode ?? "+1",
          }));
        }
      } catch (err) {
        if (!mounted) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load organization reference data.",
        );
      } finally {
        if (mounted) {
          setLoadingTypes(false);
          setLoadingCountries(false);
        }
      }
    };

    void loadReferenceData();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedType = useMemo(
    () => organizationTypes.find((item) => item.id === organizationTypeId),
    [organizationTypes, organizationTypeId],
  );

  const nameError =
    nameTouched && businessName.trim().length === 0
      ? "Business name is required."
      : nameTouched && businessName.trim().length < 2
        ? "Business name must contain at least 2 characters."
        : nameTouched && businessName.trim().length > 150
          ? "Business name must not exceed 150 characters."
          : undefined;

  const typeError =
    typeTouched && !organizationTypeId
      ? "Business type is required."
      : undefined;

  const emailError =
    emailTouched && !primaryEmail.trim()
      ? "Primary email is required."
      : emailTouched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail.trim())
        ? "Please enter a valid email address."
        : primaryEmail.trim().length > 254
          ? "Primary email must not exceed 254 characters."
          : undefined;

  const phoneError =
    phoneTouched && !primaryPhone.number.trim()
      ? "Primary phone number is required."
      : primaryPhone.number.length > 0 && primaryPhone.number.length !== 10
        ? "Primary phone number must contain exactly 10 digits."
        : undefined;

  const canCreate =
    businessName.trim().length >= 2 &&
    businessName.trim().length <= 150 &&
    !!organizationTypeId &&
    !!primaryEmail.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail.trim()) &&
    primaryEmail.trim().length <= 254 &&
    primaryPhone.number.length === 10 &&
    !!primaryPhone.countryId &&
    !!primaryPhone.callingCode &&
    !busy &&
    !loadingTypes &&
    !loadingCountries;

  const handleCreate = async () => {
    setNameTouched(true);
    setTypeTouched(true);
    setEmailTouched(true);
    setPhoneTouched(true);
    setError("");

    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }

    if (businessName.trim().length < 2) {
      setError("Business name must contain at least 2 characters.");
      return;
    }

    if (businessName.trim().length > 150) {
      setError("Business name must not exceed 150 characters.");
      return;
    }

    if (!organizationTypeId) {
      setError("Business type is required.");
      return;
    }

    if (!primaryEmail.trim()) {
      setError("Primary email is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail.trim())) {
      setError("Please enter a valid primary email address.");
      return;
    }

    if (primaryEmail.trim().length > 254) {
      setError("Primary email must not exceed 254 characters.");
      return;
    }

    if (!primaryPhone.countryId) {
      setError("Primary phone country is required.");
      return;
    }

    if (!primaryPhone.number.trim()) {
      setError("Primary phone number is required.");
      return;
    }

    if (primaryPhone.number.length !== 10) {
      setError("Primary phone number must contain exactly 10 digits.");
      return;
    }

    try {
      setBusy(true);

      console.log("PLATFORM ORGANIZATION ONBOARDING START", {
        businessName: businessName.trim(),
        organizationTypeId,
        primaryEmail: primaryEmail.trim(),
      });

      const result = await onboardOrganization({
        name: businessName.trim(),
        organizationTypeId,
        primaryEmail: primaryEmail.trim(),
        primaryPhone: {
          countryId: primaryPhone.countryId,
          callingCode: primaryPhone.callingCode,
          number: primaryPhone.number,
        },
        useDefaultBusinessContent,
      });

      console.log("PLATFORM ORGANIZATION ONBOARDING COMPLETE", {
        organizationId: result.organization.id,
        organizationName: result.organization.name,
        organizationTypeId: result.organization.organizationTypeId,
        templateId: result.context.template.id,
      });

      setActiveBusiness(result.organization.id);

      router.replace(APP_ROUTES.orgAdmin.root);
    } catch (err) {
      console.error("PLATFORM ORGANIZATION ONBOARDING ERROR", err);

      setError(
        err instanceof Error ? err.message : "Unable to create the business.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={[
        styles.scroll,
        {
          backgroundColor: theme.colors.background,
        },
      ]}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text variant="title" color="text">
          Onboard New Business
        </Text>

        <Text variant="bodySmall" color="textMuted">
          Create a new business using the Memgine starter experience for its
          business type.
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.section}>
          <Text variant="h2" color="text">
            Business Details
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Only the minimum information is required to get the business
            started. The Organization Admin can configure the remaining details
            after onboarding.
          </Text>
        </View>

        <Input
          label="Business Name"
          required
          value={businessName}
          onChangeText={(value) => {
            setBusinessName(value);

            if (error) {
              setError("");
            }
          }}
          onBlur={() => setNameTouched(true)}
          placeholder="Enter business name"
          maxLength={150}
          error={nameError}
          testID="organization-business-name"
        />

        <ReferenceSelect
          label="Business Type"
          required
          value={organizationTypeId}
          items={organizationTypes}
          onChange={(value) => {
            setOrganizationTypeId(value);
            setTypeTouched(true);

            if (error) {
              setError("");
            }
          }}
          placeholder={
            loadingTypes ? "Loading business types..." : "Select business type"
          }
          disabled={busy || loadingTypes}
          error={typeError}
          testID="organization-business-type"
        />

        <Checkbox
          value={useDefaultBusinessContent}
          onValueChange={setUseDefaultBusinessContent}
          label="Use default business content"
          description="Start this business with the standard content for its selected business type. You can customize it after onboarding."
          disabled={busy || loadingTypes}
          testID="organization-use-default-business-content"
        />

        <Input
          label="Primary Email"
          required
          value={primaryEmail}
          onChangeText={(value) => {
            setPrimaryEmail(value);

            if (error) {
              setError("");
            }
          }}
          onBlur={() => setEmailTouched(true)}
          placeholder="Enter primary email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={254}
          error={emailError}
          testID="organization-primary-email"
        />

        <PhoneField
          label="Primary Phone"
          required
          value={primaryPhone}
          countries={countries}
          onChange={(phone) => {
            setPrimaryPhone(phone);
            setPhoneTouched(true);

            if (error) {
              setError("");
            }
          }}
          error={phoneTouched ? phoneError : undefined}
          maxDigits={10}
          disabled={busy || loadingCountries}
          testID="organization-primary-phone"
        />

        {selectedType ? (
          <View
            style={[
              styles.templateCard,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text variant="bodyStrong" color="text">
              Memgine Starter Experience
            </Text>

            <Text variant="bodySmall" color="textMuted">
              A starter experience appropriate for {selectedType.name} will be
              copied into the new organization. The organization will own its
              configuration and can customize branding, memberships, benefits,
              offers, stores and integrations after onboarding.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={[
              styles.error,
              {
                borderColor: theme.colors.danger,
                backgroundColor: theme.colors.background,
              },
            ]}
          >
            <Text variant="bodySmall" color="danger">
              {error}
            </Text>
          </View>
        ) : null}

        <Pressable
          disabled={!canCreate}
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.createButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: !canCreate
                ? 0.5
                : pressed
                  ? theme.states.pressedOpacity
                  : 1,
            },
          ]}
        >
          <Text variant="bodyStrong" color="text">
            {busy ? "Creating Business..." : "Create Business"}
          </Text>
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={() => router.replace(APP_ROUTES.platformAdmin.organizations)}
          style={[
            styles.cancelButton,
            {
              opacity: busy ? 0.5 : 1,
            },
          ]}
        >
          <Text variant="bodySmall" color="textMuted">
            Cancel
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  container: {
    padding: 24,
    gap: 24,
  },

  header: {
    gap: 6,
  },

  card: {
    width: "100%",
    maxWidth: 760,
    padding: 24,
    borderWidth: 1,
    borderRadius: 12,
    gap: 22,
  },

  section: {
    gap: 6,
  },

  templateCard: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    gap: 6,
  },

  error: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
  },

  createButton: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
