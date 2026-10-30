import { createElement, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = [...value.items].sort((a, b) => a.displayOrder - b.displayOrder);
  const selectedIndex = Math.max(0, items.findIndex(item => item.id === selectedId));
  const selectedItem = items[selectedIndex] ?? null;
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
    setSelectedId(id);
  };
  const remove = (id: string) => {
    const index = items.findIndex(item => item.id === id);
    const remaining = items.filter(item => item.id !== id).map((item, displayOrder) => ({ ...item, displayOrder }));
    onChange({ ...value, items: remaining });
    setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
    setDateErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${id}:`))));
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
    <View style={{ gap: 8 }}>
      <Text variant="bodyStrong">Announcements</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ alignItems: "center", gap: 8, paddingVertical: 2 }}>
        {items.map((item, index) => {
          const selected = selectedItem?.id === item.id;
          const label = item.message.trim();
          const title = label ? (label.length > 25 ? `${label.slice(0, 25)}…` : label) : `Announcement ${index + 1}`;
          return <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={`Announcement ${index + 1}: ${title}`}
            accessibilityState={{ selected }}
            onPress={() => setSelectedId(item.id)}
            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: selected ? "#8BAF9C" : "#D9E0E6", backgroundColor: selected ? "#E7F1EB" : "#FFFFFF", minWidth: 110, maxWidth: 235 }}
          >
            <Text variant="bodyStrong">{index + 1}. {title}</Text>
            <Text variant="caption" color="textSecondary">{item.enabled ? "Enabled" : "Disabled"} · {item.style}</Text>
          </Pressable>;
        })}
        <Button label="+ Add announcement" variant="secondary" disabled={disabled || items.length >= 20} onPress={add} />
      </ScrollView>
    </View>
    {!items.length ? <Text variant="bodySmall" color="textSecondary">No announcements configured. Add one to begin.</Text> : null}
    {selectedItem ? <Card key={selectedItem.id} padding="md">
      <View style={{ gap: 12 }}>
        <Text variant="bodyStrong">Announcement {selectedIndex + 1}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button label={selectedItem.enabled ? "Enabled" : "Disabled"} variant={selectedItem.enabled ? "primary" : "secondary"} disabled={disabled} onPress={() => update(selectedItem.id, { enabled: !selectedItem.enabled })} />
          <Button label="Move up" variant="secondary" disabled={disabled || selectedIndex === 0} onPress={() => reorder(selectedItem.id, -1)} />
          <Button label="Move down" variant="secondary" disabled={disabled || selectedIndex === items.length - 1} onPress={() => reorder(selectedItem.id, 1)} />
          <Button label="Delete" variant="secondary" disabled={disabled} onPress={() => remove(selectedItem.id)} />
        </View>
        <Input label="Message" value={selectedItem.message ?? ""} editable={!disabled} onChangeText={message => update(selectedItem.id, { message })} />
        <Text variant="bodyStrong">Animation style</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ANNOUNCEMENT_STYLES.map(style => <Button key={style} label={style} variant={selectedItem.style === style ? "primary" : "secondary"} disabled={disabled} onPress={() => update(selectedItem.id, { style })} />)}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ width: 235, maxWidth: "100%" }} pointerEvents={disabled ? "none" : "auto"}><BrandColourSelect label="Background colour" value={selectedItem.backgroundColor ?? ""} onChange={backgroundColor => update(selectedItem.id, { backgroundColor: backgroundColor || null })} /></View>
          <View style={{ width: 235, maxWidth: "100%" }} pointerEvents={disabled ? "none" : "auto"}><BrandColourSelect label="Text colour" value={selectedItem.textColor ?? ""} onChange={textColor => update(selectedItem.id, { textColor: textColor || null })} /></View>
        </View>
        <Input label="Optional HTTPS link" value={selectedItem.linkUrl ?? ""} editable={!disabled} onChangeText={linkUrl => update(selectedItem.id, { linkUrl: linkUrl || null })} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{dateField(selectedItem, "startsAt", "Start date and time")}{dateField(item, "endsAt", "End date and time")}</View>
        <Text variant="caption" color="textSecondary">Times use your device’s local timezone. Leave empty for no schedule limit.</Text>
      </View>
    </Card> : null}
    {errors.map((error, index) => <Text key={index} variant="bodySmall" color="danger">{error}</Text>)}
  </View>;
}
