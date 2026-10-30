import { createElement, useState } from "react";
import { Platform, View } from "react-native";
import { BrandColourSelect, Button, Card, Input, Text } from "@/src/ui";
import {
  ANNOUNCEMENT_STYLES,
  validateAnnouncementConfiguration,
  type AnnouncementConfiguration,
  type AnnouncementItemConfig,
} from "./announcement-model";

type Props = {
  value: AnnouncementConfiguration;
  onChange: (value: AnnouncementConfiguration) => void;
  disabled: boolean;
};

const localDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function AnnouncementEditor({ value, onChange, disabled }: Props) {
  const [dateErrors, setDateErrors] = useState<Record<string, string>>({});
  const items = [...value.items].sort((a, b) => a.displayOrder - b.displayOrder);
  const update = (id: string, patch: Partial<AnnouncementItemConfig>) =>
    onChange({ ...value, items: value.items.map(item => item.id === id ? { ...item, ...patch } : item) });
  const reorder = (id: string, delta: number) => {
    const ordered = [...items];
    const index = ordered.findIndex(item => item.id === id);
    const target = index + delta;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    onChange({ ...value, items: ordered.map((item, displayOrder) => ({ ...item, displayOrder })) });
  };
  const add = () => {
    if (items.length >= 20) return;
    const id = `announcement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    onChange({ ...value, items: [...items, { id, enabled: false, message: "", style: "STATIC", displayOrder: items.length }] });
  };
  const dateField = (item: AnnouncementItemConfig, field: "startsAt" | "endsAt", label: string) => {
    const key = `${item.id}:${field}`;
    const onValue = (text: string) => {
      if (!text) {
        setDateErrors(previous => ({ ...previous, [key]: "" }));
        update(item.id, { [field]: null });
        return;
      }
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        setDateErrors(previous => ({ ...previous, [key]: `Invalid ${label.toLowerCase()}.` }));
        update(item.id, { [field]: text });
        return;
      }
      setDateErrors(previous => ({ ...previous, [key]: "" }));
      update(item.id, { [field]: parsed.toISOString() });
    };
    return <View style={{ minWidth: 210, flexGrow: 1 }} key={field}>
      {Platform.OS === "web" ? <>
        <Text variant="bodyStrong">{label}</Text>
        {createElement("input", { type: "datetime-local", value: localDateTime(item[field]), disabled, onChange: (event: any) => onValue(event.target.value), style: { width: "100%", height: 42, border: "1px solid #D9E0E6", borderRadius: 10, padding: "0 10px" } } as any)}
      </> : <Input label={`${label} (local YYYY-MM-DDTHH:MM)`} value={localDateTime(item[field])} editable={!disabled} onChangeText={onValue} />}
      {dateErrors[key] ? <Text variant="caption" color="danger">{dateErrors[key]}</Text> : null}
    </View>;
  };
  const errors = validateAnnouncementConfiguration(value);
  return <View style={{ gap: 14, maxWidth: 860 }}>
    <Text variant="bodyStrong">Display mode</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {(["SINGLE", "CAROUSEL"] as const).map(mode => <Button key={mode} label={mode === "SINGLE" ? "Single" : "Carousel"} variant={value.displayMode === mode ? "primary" : "secondary"} disabled={disabled} onPress={() => onChange({ ...value, displayMode: mode })} />)}
    </View>
    {value.displayMode === "CAROUSEL" ? <Input label="Rotation interval (3–60 seconds)" value={String(value.rotationIntervalSeconds)} editable={!disabled} onChangeText={text => onChange({ ...value, rotationIntervalSeconds: Number(text) })} /> : null}
    <Button label="Add announcement" variant="secondary" disabled={disabled || items.length >= 20} onPress={add} />
    {!items.length ? <Text variant="bodySmall" color="textSecondary">No announcements configured. Add one to begin.</Text> : null}
    {items.map((item, index) => <Card key={item.id} padding="md">
      <View style={{ gap: 12 }}>
        <Text variant="bodyStrong">Announcement {index + 1}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button label={item.enabled ? "Enabled" : "Disabled"} variant={item.enabled ? "primary" : "secondary"} disabled={disabled} onPress={() => update(item.id, { enabled: !item.enabled })} />
          <Button label="Move up" variant="secondary" disabled={disabled || index === 0} onPress={() => reorder(item.id, -1)} />
          <Button label="Move down" variant="secondary" disabled={disabled || index === items.length - 1} onPress={() => reorder(item.id, 1)} />
          <Button label="Delete" variant="secondary" disabled={disabled} onPress={() => onChange({ ...value, items: items.filter(entry => entry.id !== item.id).map((entry, displayOrder) => ({ ...entry, displayOrder })) })} />
        </View>
        <Input label="Message" value={item.message ?? ""} editable={!disabled} onChangeText={message => update(item.id, { message })} />
        <Text variant="bodyStrong">Animation style</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ANNOUNCEMENT_STYLES.map(style => <Button key={style} label={style} variant={item.style === style ? "primary" : "secondary"} disabled={disabled} onPress={() => update(item.id, { style })} />)}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ width: 235, maxWidth: "100%" }} pointerEvents={disabled ? "none" : "auto"}><BrandColourSelect label="Background colour" value={item.backgroundColor ?? ""} onChange={backgroundColor => update(item.id, { backgroundColor: backgroundColor || null })} /></View>
          <View style={{ width: 235, maxWidth: "100%" }} pointerEvents={disabled ? "none" : "auto"}><BrandColourSelect label="Text colour" value={item.textColor ?? ""} onChange={textColor => update(item.id, { textColor: textColor || null })} /></View>
        </View>
        <Input label="Optional HTTPS link" value={item.linkUrl ?? ""} editable={!disabled} onChangeText={linkUrl => update(item.id, { linkUrl: linkUrl || null })} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{dateField(item, "startsAt", "Start date and time")}{dateField(item, "endsAt", "End date and time")}</View>
        <Text variant="caption" color="textSecondary">Times use your device’s local timezone. Leave empty for no schedule limit.</Text>
      </View>
    </Card>)}
    {errors.map((error, index) => <Text key={index} variant="bodySmall" color="danger">{error}</Text>)}
  </View>;
}
