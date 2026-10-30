import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import type { OrganizationBranding } from "@/src/core";
import { services } from "@/src/core";
import { BrandingApi } from "@/src/data/api/branding-api";
import { useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { BrandingForm } from "@/src/ui/admin/BrandingForm";
import { OrganizationThemePanel } from "@/src/ui/admin/OrganizationThemePanel";

export default function OrgAdminBranding() {
  const { organization } = useBusiness();
  const brandingApi = useMemo(() => new BrandingApi(), []);
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [previewBranding, setPreviewBranding] = useState<OrganizationBranding | null>(null);
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof services.template.listTemplates>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const themeDraftRef = useRef<OrganizationBranding | null>(null);
  const [themeDirty, setThemeDirty] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void Promise.all([
      services.organization.getOrganizationBranding(organization.id),
      services.template.listTemplates(),
    ]).then(([item, items]) => {
      if (!active) return;
      setBranding(item); setPreviewBranding(item); setTemplates(items);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load branding."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id]);

  if (loading) return <View style={{ flex: 1 }}><StateView kind="loading" title="Loading branding" message="Loading organization branding..." /></View>;
  if (error) return <View style={{ flex: 1 }}><StateView kind="error" title="Unable to load branding" message={error} /></View>;

  // Identity and theme share one edit/save transaction from the user's perspective.
  // Keep the latest theme draft in a ref so Save Changes never uses stale state.

  const themeKeys = [
    "platformThemeCode", "primaryColor", "secondaryColor", "accentColor",
    "backgroundColor", "textColor", "backgroundImageUrl", "decoration", "announcementEnabled",
    "announcementMessage", "announcementStyle", "announcementBackgroundColor",
    "announcementTextColor", "announcementLinkUrl", "announcementStartsAt",
    "announcementEndsAt",
  ] as const;

  const handleThemeChange = (draft: OrganizationBranding) => {
    themeDraftRef.current = draft;
    setPreviewBranding(draft);
    setThemeDirty(themeKeys.some(key => JSON.stringify(draft[key] ?? null) !== JSON.stringify(branding?.[key] ?? null)));
  };

  const discardTheme = () => {
    themeDraftRef.current = null;
    setPreviewBranding(branding);
    setThemeDirty(false);
    setResetKey(value => value + 1);
  };

  const saveChanges = async (updated: OrganizationBranding, identityChanged: boolean): Promise<OrganizationBranding> => {
    // A legacy identity write also increments the persisted version. Use the
    // refreshed row as the base for the optimistic-locking theme draft save.
    let persisted = branding ?? updated;
    if (identityChanged) {
      persisted = await services.organization.updateOrganizationBranding(organization.id, updated);
    }

    const draft = themeDraftRef.current;
    let saved = persisted;
    if (themeDirty && draft) {
      const combined: OrganizationBranding = {
        ...persisted,
        ...Object.fromEntries(themeKeys.map(key => [key, draft[key]])),
        id: persisted.id,
        organizationId: persisted.organizationId,
        versionNo: persisted.versionNo,
      };
      const result = await brandingApi.saveBrandingDraft(organization.id, combined);
      if (!result.success) {
        // Do not discard edits or claim success if identity saved but theme failed.
        // Retrying an identity save in this state would be unsafe: force an
        // explicit refresh/reconciliation via the error message.
        throw new Error(
          identityChanged
            ? `Identity was saved, but theme draft failed: ${result.error.message}. Refresh before retrying to reconcile saved identity changes.`
            : result.error.message,
        );
      }
      saved = result.data;
    }

    setBranding(saved);
    setPreviewBranding(saved);
    themeDraftRef.current = null;
    setThemeDirty(false);
    setResetKey(value => value + 1);
    return saved;
  };

  return <BrandingForm
    organization={organization}
    branding={branding}
    templates={templates}
    onSave={saveChanges}
    themeDirty={themeDirty}
    onDiscardTheme={discardTheme}
    previewOverride={previewBranding}
    themeSection={branding ? (editing) => <OrganizationThemePanel
      branding={branding}
      editing={editing}
      resetKey={resetKey}
      organizationId={organization.id}
      organizationName={organization.displayName ?? organization.name}
      onDraftChange={handleThemeChange}
    /> : undefined}
  />;
}
