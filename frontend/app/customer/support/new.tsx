import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core/services/service-registry";
import type { CustomerDiscoverableOrganization } from "@/src/data/api/customer-data-api";
import type { ReferenceDataItem, SupportIssueTypeReferenceDataItem } from "@/src/core/services/reference-data";
import { Screen } from "@/src/layout";
import { useCustomerContext, useTheme } from "@/src/providers";
import { Button, Header, Input, ReferenceSelect, StateView, Text, TextArea } from "@/src/ui";

type FormErrors = Partial<Record<"organizationId" | "category" | "issueType" | "subject" | "description", string>>;

export default function NewCustomerSupportRequest() {
  const router = useRouter();
  const params = useLocalSearchParams<{ organizationId?: string | string[] }>();
  const theme = useTheme();
  const { landing, customersLoading } = useCustomerContext();
  const [organizations, setOrganizations] = useState<CustomerDiscoverableOrganization[]>([]);
  const [categories, setCategories] = useState<ReferenceDataItem[]>([]);
  const [issueTypes, setIssueTypes] = useState<SupportIssueTypeReferenceDataItem[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [destination, setDestination] = useState<"BUSINESS" | "PLATFORM">("BUSINESS");
  const [category, setCategory] = useState("");
  const [issueType, setIssueType] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialOrganizationId = Array.isArray(params.organizationId) ? params.organizationId[0] : params.organizationId;

  useEffect(() => {
    if (!initialOrganizationId || organizationId) return;
    setOrganizationId(initialOrganizationId);
  }, [initialOrganizationId, organizationId]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [discoverable, nextCategories, nextIssueTypes] = await Promise.all([
        landing ? Promise.resolve(landing.discoverableOrganizations) : services.customerData.discoverOrganizations(),
        services.referenceData.listSupportCategories(),
        services.referenceData.listSupportIssueTypes(),
      ]);
      setOrganizations(discoverable);
      setCategories(nextCategories.filter((item) => item.active));
      setIssueTypes(nextIssueTypes.filter((item) => item.active));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Unable to load support options.");
    }
  }, [landing]);

  useEffect(() => {
    if (!customersLoading) void load();
  }, [customersLoading, load]);

  const selectedCategory = categories.find((item) => item.code === category);
  const availableCategories = useMemo(() => destination === "PLATFORM" ? categories.filter((item) => item.code === "ACCOUNT" || item.code === "GENERAL") : categories, [categories, destination]);
  const availableIssueTypes = useMemo(() => issueTypes.filter((item) => item.categoryId === selectedCategory?.id), [issueTypes, selectedCategory?.id]);

  const changeDestination = (value: string) => {
    const next = value as "BUSINESS" | "PLATFORM";
    setDestination(next);
    setOrganizationId("");
    setCategory("");
    setIssueType("");
    setErrors({});
  };

  const changeCategory = (value: string) => {
    setCategory(value);
    setIssueType("");
    setErrors((current) => ({ ...current, category: undefined, issueType: undefined }));
  };

  const submit = async () => {
    const nextErrors: FormErrors = {};
    const cleanedSubject = subject.trim();
    const cleanedDescription = description.trim();
    if (destination === "BUSINESS" && !organizationId) nextErrors.organizationId = "Select a business.";
    if (!category) nextErrors.category = "Select a category.";
    if (!issueType) nextErrors.issueType = "Select an issue type.";
    if (!cleanedSubject) nextErrors.subject = "Enter a subject.";
    if (!cleanedDescription) nextErrors.description = "Describe the issue.";
    if (cleanedSubject.length > 200) nextErrors.subject = "Subject must be 200 characters or fewer.";
    if (cleanedDescription.length > 8000) nextErrors.description = "Description must be 8,000 characters or fewer.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    try {
      const created = await services.customerSupport.create({ organizationId: destination === "BUSINESS" ? organizationId : null, destination, category, issueType, subject: cleanedSubject, description: cleanedDescription });
      router.replace(APP_ROUTES.customer.supportRequest(created.supportRequestId) as never);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "We could not confirm your request. Check Support Requests before submitting again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (customersLoading && !landing) return <Screen><StateView kind="loading" title="Loading support options" /></Screen>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        header={
          <Header
            title="New Support Request"
            subtitle="Tell us how we can help"
            left={
              <Button
                label="Back"
                variant="ghost"
                size="sm"
                onPress={() =>
                  router.canGoBack()
                    ? router.back()
                    : router.replace(APP_ROUTES.customer.support as never)
                }
              />
            }
          />
        }
        contentStyle={{
          maxWidth: 720,
          width: "100%",
          alignSelf: "center",
          paddingBottom: theme.spacing.xxl,
        }}
      >
        {loadError ? <View style={{ gap: theme.spacing.sm }}><Text variant="bodySmall" color="danger">{loadError}</Text><Button label="Retry" variant="secondary" onPress={() => void load()} /></View> : null}
        <ReferenceSelect label="Support destination" required value={destination} items={["BUSINESS", "PLATFORM"]} onChange={changeDestination} getItemId={(item) => item} renderItemLabel={(item) => item === "BUSINESS" ? "Business Support" : "Memgine Support"} />
        {destination === "BUSINESS" ? <ReferenceSelect label="Business" required value={organizationId} items={organizations} onChange={(value) => { setOrganizationId(value); setErrors((current) => ({ ...current, organizationId: undefined })); }} placeholder="Select a business" error={errors.organizationId} getItemId={(item) => item.organizationId} renderItemLabel={(item) => item.displayName || item.name} /> : <Text variant="bodySmall" color="textMuted">This request goes directly to Memgine Support.</Text>}
        <ReferenceSelect label="Support category" required value={category} items={availableCategories} onChange={changeCategory} placeholder="Select a category" error={errors.category} getItemId={(item) => item.code} renderItemLabel={(item) => item.name} />
        <ReferenceSelect label="Issue type" required value={issueType} items={availableIssueTypes} onChange={(value) => { setIssueType(value); setErrors((current) => ({ ...current, issueType: undefined })); }} placeholder={category ? "Select an issue type" : "Select a category first"} disabled={!category} error={errors.issueType} getItemId={(item) => item.code} renderItemLabel={(item) => item.name} />
        <Input label="Subject" required value={subject} onChangeText={(value) => { setSubject(value); setErrors((current) => ({ ...current, subject: undefined })); }} maxLength={200} error={errors.subject} placeholder="Briefly describe what you need help with" />
        <TextArea label="Description" required value={description} onChangeText={(value) => { setDescription(value); setErrors((current) => ({ ...current, description: undefined })); }} maxLength={8000} error={errors.description} placeholder="Include any details that will help us investigate." />
        <Button label={submitting ? "Submitting…" : "Submit request"} fullWidth disabled={submitting || !!loadError} onPress={() => void submit()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
