import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { createElement } from "react";
import type { OrganizationBranding, PlatformBrandingThemeV2 } from "@/src/core";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { DEFAULT_DECORATION } from "@/src/core/branding-decoration.types";
import { pickBrandingAsset } from "@/src/core/brandingAssetPicker";
import { brandingAssetApi } from "@/src/data/api/branding-asset-api";
import { platformBrandingThemeApi } from "@/src/data/api/platform-branding-theme-api";
import { BrandColourSelect, Button, Card, Input, Section, Text } from "@/src/ui";
import { CustomerThemePreview } from "@/src/ui/domain/CustomerThemePreview";

type Props = {
  branding: OrganizationBranding;
  editing: boolean;
  organizationId: string;
  organizationName: string;
  onDraftChange: (branding: OrganizationBranding) => void;
  resetKey: number;
};
const fields = ["primaryColor", "secondaryColor", "accentColor", "backgroundColor", "textColor"] as const;
const styles = ["STATIC", "FADE", "SLIDE", "TICKER"] as const;
const previewTheme = (b: OrganizationBranding) => ({
  primaryColor: b.primaryColor ?? "#0F766E", secondaryColor: b.secondaryColor ?? "#115E59",
  accentColor: b.accentColor ?? "#F59E0B", backgroundColor: b.backgroundColor ?? "#FFFFFF",
  textColor: b.textColor ?? "#1F2937", backgroundImageUrl: b.backgroundImageUrl ?? null,
  decoration: b.decoration ?? null,
});
export function OrganizationThemePanel({ branding, editing, organizationId, organizationName, onDraftChange, resetKey }: Props) {
  const [themes, setThemes] = useState<PlatformBrandingThemeV2[]>([]);
  const [draft, setDraft] = useState<OrganizationBranding>(branding);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = !editing;
  useEffect(() => { setDraft(branding); setClock({}); }, [branding, resetKey]);
  useEffect(() => {
    let active = true;
    void platformBrandingThemeApi.listPublished().then(result => {
      if (!active) return;
      if (result.success) setThemes(result.data); else setError(result.error.message);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load themes"); });
    return () => { active = false; };
  }, []);
  const available = useMemo(() => themes.filter(t => t.isActive && t.publicationStatus === "PUBLISHED" && !!t.publishedTheme), [themes]);
  const selected = available.find(t => t.code === draft.platformThemeCode);
  const change = (patch: Partial<OrganizationBranding>) => {
    if (locked) return;
    const next = { ...draft, ...patch };
    setDraft(next); onDraftChange(next); setNotice(null); setError(null);
  };
  const editDecoration = <K extends keyof BrandingDecorationConfig>(key: K, value: BrandingDecorationConfig[K]) => {
    change({ decoration: { ...DEFAULT_DECORATION, ...(draft.decoration ?? {}), [key]: value } });
  };
  const choose = (t: PlatformBrandingThemeV2) => {
    if (locked || !t.publishedTheme) return;
    change({ ...t.publishedTheme, platformThemeCode: t.code });
    setNotice(`Selected ${t.displayName}. Save Changes to retain changes.`);
  };
  const upload = async () => {
    if (locked) return;
    try {
      const file = await pickBrandingAsset({ assetType: "themeBackground" });
      if (!file) return;
      const uploaded = await brandingAssetApi.upload(organizationId, "themeBackground", file);
      change({ backgroundImageUrl: uploaded.path });
      setNotice("Background uploaded. Use Save Changes to retain it.");
    } catch (e) { setError(e instanceof Error ? e.message : "Background upload failed"); }
  };
  const textField = (key: keyof OrganizationBranding, label: string, placeholder?: string) => (
    <View style={{ pointerEvents: locked ? "none" : "auto", opacity: locked ? 0.75 : 1 }}>
      <Input label={label} placeholder={placeholder} value={String(draft[key] ?? "")}
        editable={!locked} onChangeText={value => change({ [key]: value || null } as Partial<OrganizationBranding>)} />
    </View>
  );
  const parseDateTime = (value?: string | null) => {
    if (!value) return { date: "", time: "" };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { date: "", time: "" };
    const pad = (n: number) => String(n).padStart(2, "0");
    return { date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  };
  const [clock, setClock] = useState<Record<string, string>>({});
  const dateTimeControl = (field: "announcementStartsAt" | "announcementEndsAt", label: string) => {
    const d = parseDateTime(draft[field]);
    const date = clock[`${field}Date`] ?? d.date;
    const time = clock[`${field}Time`] ?? d.time;
    const setPart = (part: "Date" | "Time", value: string) => {
      if (locked) return;
      const next = { ...clock, [`${field}${part}`]: value };
      setClock(next);
      const day = next[`${field}Date`] ?? d.date;
      const hour = next[`${field}Time`] ?? d.time;
      if (!day) { change({ [field]: null }); return; }
      const parsed = new Date(`${day}T${hour || "00:00"}:00`);
      if (!Number.isNaN(parsed.getTime())) change({ [field]: parsed.toISOString() });
    };
    const picker = (kind: "date" | "time", value: string, onValue: (v: string) => void) => Platform.OS === "web"
      ? createElement("input", { type: kind, value, disabled: locked, onChange: (event: any) => onValue(event.target.value), style: { boxSizing: "border-box", width: "100%", height: 42, border: "1px solid #D9E0E6", borderRadius: 10, padding: "0 11px", fontSize: 14, background: locked ? "#F5F7F8" : "#FFFFFF", color: "#1F2937" } } as any)
      : <Input label={kind === "date" ? "Date (YYYY-MM-DD)" : "Time (HH:MM)"} value={value} editable={!locked} onChangeText={onValue} />;
    return <View style={{ flex: 1, minWidth: 220, maxWidth: 290, gap: 6 }}>
      <Text variant="bodyStrong">{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1.4 }}>{picker("date", date, v => setPart("Date", v))}</View>
        <View style={{ flex: 1 }}>{picker("time", time, v => setPart("Time", v))}</View>
      </View>
    </View>;
  };
  return (
    <Card padding="lg" elevation="sm">
      <Section title="Brand Colors & Themes" description="Choose a published platform theme, then customize your organization's own draft.">
        <View style={{ gap: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxWidth: "100%" }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {available.map(t => {
              const p = t.publishedTheme!;
              const isSelected = draft.platformThemeCode === t.code;
              return <View key={t.id} style={{ width: 174, gap: 7, borderWidth: isSelected ? 2 : 1, borderColor: isSelected ? "#0F766E" : "#D6DEE4", padding: 9, borderRadius: 12 }}>
                <Text variant="bodyStrong">{t.displayName}</Text>
                <View style={{ flexDirection: "row", height: 18, borderRadius: 4, overflow: "hidden" }}>
                  {[p.primaryColor,p.secondaryColor,p.accentColor,p.backgroundColor,p.textColor].map((c,i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
                </View>
                <CustomerThemePreview theme={p} compact />
                <Button label={isSelected ? "Selected" : "Select Theme"} variant="secondary" disabled={locked || isSelected} onPress={() => choose(t)} />
              </View>;
            })}
          </ScrollView>
          {available.length === 0 ? <Text variant="bodySmall" color="textSecondary">No published themes available. Check that the public theme API returns publishedTheme values.</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {fields.map(key => <View key={key} style={{ width: 235, maxWidth: "100%" }}>
              <View pointerEvents={locked ? "none" : "auto"} style={{ opacity: locked ? 0.7 : 1 }}><BrandColourSelect label={key.replace(/([A-Z])/g," $1").replace(/^./, c => c.toUpperCase())} value={draft[key] ?? ""} onChange={value => change({ [key]: value } as Partial<OrganizationBranding>)} /></View>
            </View>)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button label={draft.backgroundImageUrl ? "Replace Background" : "Upload Background"} variant="secondary" disabled={locked} onPress={() => void upload()} />
            <Button label="Remove Background" variant="secondary" disabled={locked || !draft.backgroundImageUrl} onPress={() => change({ backgroundImageUrl: null })} />
            <Button label="Restore Preset" variant="secondary" disabled={locked || !selected} onPress={() => { if (selected) choose(selected); }} />
          </View>
          <Section title="Decoration" description="The selected theme's configurable decorations. Customer changes stay private until Customer Experience is published.">
            <View style={{ gap: 12 }}>
              <Text variant="bodyStrong">Decoration style</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button label="NONE" disabled={locked} variant={(draft.decoration?.style ?? DEFAULT_DECORATION.style) === "NONE" ? "primary" : "secondary"} onPress={() => editDecoration("style", "NONE")} />
                <Button label="CORNERS" disabled={locked} variant={(draft.decoration?.style ?? DEFAULT_DECORATION.style) === "CORNERS" ? "primary" : "secondary"} onPress={() => editDecoration("style", "CORNERS")} />
                <Button label="PATTERN" disabled={locked} variant={(draft.decoration?.style ?? DEFAULT_DECORATION.style) === "PATTERN" ? "primary" : "secondary"} onPress={() => editDecoration("style", "PATTERN")} />
                <Button label="CONFETTI" disabled={locked} variant={(draft.decoration?.style ?? DEFAULT_DECORATION.style) === "CONFETTI" ? "primary" : "secondary"} onPress={() => editDecoration("style", "CONFETTI")} />
                <Button label="BORDER" disabled={locked} variant={(draft.decoration?.style ?? DEFAULT_DECORATION.style) === "BORDER" ? "primary" : "secondary"} onPress={() => editDecoration("style", "BORDER")} />
              </View>
              <Text variant="bodyStrong">Intensity</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button label="SUBTLE" disabled={locked} variant={(draft.decoration?.intensity ?? DEFAULT_DECORATION.intensity) === "SUBTLE" ? "primary" : "secondary"} onPress={() => editDecoration("intensity", "SUBTLE")} />
                <Button label="BALANCED" disabled={locked} variant={(draft.decoration?.intensity ?? DEFAULT_DECORATION.intensity) === "BALANCED" ? "primary" : "secondary"} onPress={() => editDecoration("intensity", "BALANCED")} />
                <Button label="FESTIVE" disabled={locked} variant={(draft.decoration?.intensity ?? DEFAULT_DECORATION.intensity) === "FESTIVE" ? "primary" : "secondary"} onPress={() => editDecoration("intensity", "FESTIVE")} />
              </View>
              <Text variant="bodyStrong">Card surface</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button label="SOLID" disabled={locked} variant={(draft.decoration?.cardTreatment ?? DEFAULT_DECORATION.cardTreatment) === "SOLID" ? "primary" : "secondary"} onPress={() => editDecoration("cardTreatment", "SOLID")} />
                <Button label="DECORATIVE" disabled={locked} variant={(draft.decoration?.cardTreatment ?? DEFAULT_DECORATION.cardTreatment) === "DECORATIVE" ? "primary" : "secondary"} onPress={() => editDecoration("cardTreatment", "DECORATIVE")} />
                <Button label="IMAGE_OVERLAY" disabled={locked} variant={(draft.decoration?.cardTreatment ?? DEFAULT_DECORATION.cardTreatment) === "IMAGE_OVERLAY" ? "primary" : "secondary"} onPress={() => editDecoration("cardTreatment", "IMAGE_OVERLAY")} />
              </View>
              <Text variant="bodyStrong">Header</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button label="SOLID" disabled={locked} variant={(draft.decoration?.headerTreatment ?? DEFAULT_DECORATION.headerTreatment) === "SOLID" ? "primary" : "secondary"} onPress={() => editDecoration("headerTreatment", "SOLID")} />
                <Button label="DECORATIVE" disabled={locked} variant={(draft.decoration?.headerTreatment ?? DEFAULT_DECORATION.headerTreatment) === "DECORATIVE" ? "primary" : "secondary"} onPress={() => editDecoration("headerTreatment", "DECORATIVE")} />
                <Button label="IMAGE" disabled={locked} variant={(draft.decoration?.headerTreatment ?? DEFAULT_DECORATION.headerTreatment) === "IMAGE" ? "primary" : "secondary"} onPress={() => editDecoration("headerTreatment", "IMAGE")} />
              </View>
              <Text variant="bodyStrong">Pattern</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button label="NONE" disabled={locked} variant={(draft.decoration?.pattern ?? DEFAULT_DECORATION.pattern) === "NONE" ? "primary" : "secondary"} onPress={() => editDecoration("pattern", "NONE")} />
                <Button label="DOTS" disabled={locked} variant={(draft.decoration?.pattern ?? DEFAULT_DECORATION.pattern) === "DOTS" ? "primary" : "secondary"} onPress={() => editDecoration("pattern", "DOTS")} />
                <Button label="SPARKLES" disabled={locked} variant={(draft.decoration?.pattern ?? DEFAULT_DECORATION.pattern) === "SPARKLES" ? "primary" : "secondary"} onPress={() => editDecoration("pattern", "SPARKLES")} />
                <Button label="DIAMONDS" disabled={locked} variant={(draft.decoration?.pattern ?? DEFAULT_DECORATION.pattern) === "DIAMONDS" ? "primary" : "secondary"} onPress={() => editDecoration("pattern", "DIAMONDS")} />
              </View>
              <Text variant="bodyStrong">Border</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button label="NONE" disabled={locked} variant={(draft.decoration?.borderStyle ?? DEFAULT_DECORATION.borderStyle) === "NONE" ? "primary" : "secondary"} onPress={() => editDecoration("borderStyle", "NONE")} />
                <Button label="SOLID" disabled={locked} variant={(draft.decoration?.borderStyle ?? DEFAULT_DECORATION.borderStyle) === "SOLID" ? "primary" : "secondary"} onPress={() => editDecoration("borderStyle", "SOLID")} />
                <Button label="ELEGANT" disabled={locked} variant={(draft.decoration?.borderStyle ?? DEFAULT_DECORATION.borderStyle) === "ELEGANT" ? "primary" : "secondary"} onPress={() => editDecoration("borderStyle", "ELEGANT")} />
              </View>
            </View>
          </Section>
          <Section title="Announcement" description="Organization-specific announcement settings.">
            <View style={{ gap: 12, maxWidth: 860 }}>
              <View style={{ maxWidth: 360 }}><Button label={draft.announcementEnabled ? "Disable Announcement" : "Enable Announcement"} variant="secondary" disabled={locked} onPress={() => change({ announcementEnabled: !draft.announcementEnabled })} /></View>
              <View style={{ maxWidth: 700 }}>{textField("announcementMessage", "Message")}</View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{styles.map(s => <Button key={s} label={s} variant={draft.announcementStyle === s ? "primary" : "secondary"} disabled={locked} onPress={() => change({ announcementStyle: s })} />)}</View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <View style={{ width: 235, maxWidth: "100%" }}><View pointerEvents={locked ? "none" : "auto"} style={{ opacity: locked ? 0.7 : 1 }}><BrandColourSelect label="Announcement Background" value={draft.announcementBackgroundColor ?? ""} onChange={v => change({ announcementBackgroundColor: v })} /></View></View>
                <View style={{ width: 235, maxWidth: "100%" }}><View pointerEvents={locked ? "none" : "auto"} style={{ opacity: locked ? 0.7 : 1 }}><BrandColourSelect label="Announcement Text" value={draft.announcementTextColor ?? ""} onChange={v => change({ announcementTextColor: v })} /></View></View>
              </View>
              <View style={{ maxWidth: 600 }}>{textField("announcementLinkUrl", "Optional HTTPS Link")}</View>
              <View style={{ borderWidth: 1, borderColor: "#E1E5EA", borderRadius: 12, padding: 14, alignSelf: "flex-start", width: "100%", maxWidth: 640, gap: 12 }}>
                <Text variant="bodyStrong">Announcement schedule</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {dateTimeControl("announcementStartsAt", "Start date & time")}
                  {dateTimeControl("announcementEndsAt", "End date & time")}
                </View>
                <Text variant="caption" color="textSecondary">Times are entered in your device's local timezone. Leave a date empty for no schedule limit.</Text>
              </View>

            </View>
          </Section>
          {notice ? <Text variant="bodySmall" color="primary">{notice}</Text> : null}
          {error ? <Text variant="bodySmall" color="danger">{error}</Text> : null}
        </View>
      </Section>
    </Card>
  );
}
