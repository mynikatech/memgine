export const ANNOUNCEMENT_STYLES = [
  "STATIC", "FADE", "SLIDE", "TICKER", "TYPEWRITER", "REVEAL", "PULSE",
] as const;

export type AnnouncementStyle = (typeof ANNOUNCEMENT_STYLES)[number];
export type AnnouncementDisplayMode = "SINGLE" | "CAROUSEL";

export interface AnnouncementItemConfig {
  id: string;
  enabled: boolean;
  message: string;
  style: AnnouncementStyle;
  backgroundColor?: string | null;
  textColor?: string | null;
  linkUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  displayOrder: number;
}

export interface AnnouncementConfiguration {
  displayMode: AnnouncementDisplayMode;
  rotationIntervalSeconds: number;
  items: AnnouncementItemConfig[];
}

export const EMPTY_ANNOUNCEMENT_CONFIGURATION: AnnouncementConfiguration = {
  displayMode: "SINGLE",
  rotationIntervalSeconds: 5,
  items: [],
};

const HEX = /^#[0-9a-f]{6}$/i;

export function validateAnnouncementConfiguration(config: AnnouncementConfiguration): string[] {
  const problems: string[] = [];
  if (config.displayMode !== "SINGLE" && config.displayMode !== "CAROUSEL")
    problems.push("Display mode must be SINGLE or CAROUSEL.");
  if (!Number.isInteger(config.rotationIntervalSeconds) || config.rotationIntervalSeconds < 3 || config.rotationIntervalSeconds > 60)
    problems.push("Rotation interval must be an integer from 3 to 60 seconds.");
  if (!Array.isArray(config.items) || config.items.length > 20) {
    problems.push("An announcement configuration supports at most 20 entries.");
    return problems;
  }
  const ids = new Set<string>();
  for (const [index, item] of config.items.entries()) {
    const label = `Announcement ${index + 1}`;
    const normalizedId = item.id?.trim();
    if (!normalizedId || ids.has(normalizedId)) problems.push(`${label}: ID must be unique and nonblank.`);
    if (normalizedId) ids.add(normalizedId);
    if (!ANNOUNCEMENT_STYLES.includes(item.style)) problems.push(`${label}: invalid animation style.`);
    if (item.enabled && !item.message?.trim()) problems.push(`${label}: enabled items require a message.`);
    if (item.backgroundColor && !HEX.test(item.backgroundColor)) problems.push(`${label}: invalid background colour.`);
    if (item.textColor && !HEX.test(item.textColor)) problems.push(`${label}: invalid text colour.`);
    if (item.linkUrl && !/^https:\/\/\S+$/.test(item.linkUrl)) problems.push(`${label}: links must use HTTPS.`);
    const start = item.startsAt ? Date.parse(item.startsAt) : undefined;
    const end = item.endsAt ? Date.parse(item.endsAt) : undefined;
    if (item.startsAt && !Number.isFinite(start)) problems.push(`${label}: invalid start date.`);
    if (item.endsAt && !Number.isFinite(end)) problems.push(`${label}: invalid end date.`);
    if (start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end) && end <= start)
      problems.push(`${label}: end date must be after start date.`);
  }
  return problems;
}

export function getActiveAnnouncements(config: AnnouncementConfiguration, now = Date.now()): AnnouncementItemConfig[] {
  return config.items
    .filter(item => {
      if (!item.enabled || !item.message.trim()) return false;
      if (item.startsAt && (!Number.isFinite(Date.parse(item.startsAt)) || Date.parse(item.startsAt) > now)) return false;
      if (item.endsAt && (!Number.isFinite(Date.parse(item.endsAt)) || Date.parse(item.endsAt) <= now)) return false;
      return true;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
}

export function announcementDwellMs(item: AnnouncementItemConfig, rotationIntervalSeconds: number): number {
  const base = Math.max(3, Math.min(60, rotationIntervalSeconds)) * 1000;
  if (item.style === "TYPEWRITER") return Math.max(base, item.message.length * 55 + 3000);
  // The ticker traverses the banner and its own measured width; allow a full
  // approximate pass even when the configured rotation interval is short.
  if (item.style === "TICKER") return Math.max(base, 20000, item.message.length * 180 + 12000);
  return base;
}

/** Old releases contain a single announcement rather than a configuration. */
export function resolveAnnouncementConfiguration(branding: {
  announcementConfiguration?: AnnouncementConfiguration | null;
  announcementEnabled?: boolean;
  announcementMessage?: string | null;
  announcementStyle?: AnnouncementStyle;
  announcementBackgroundColor?: string | null;
  announcementTextColor?: string | null;
  announcementLinkUrl?: string | null;
  announcementStartsAt?: string | null;
  announcementEndsAt?: string | null;
} | null | undefined): AnnouncementConfiguration {
  if (branding?.announcementConfiguration) return branding.announcementConfiguration;
  if (!branding?.announcementMessage?.trim()) return EMPTY_ANNOUNCEMENT_CONFIGURATION;
  return {
    displayMode: "SINGLE",
    rotationIntervalSeconds: 5,
    items: [{
      id: "legacy-announcement",
      enabled: branding.announcementEnabled ?? false,
      message: branding.announcementMessage,
      style: branding.announcementStyle ?? "STATIC",
      backgroundColor: branding.announcementBackgroundColor,
      textColor: branding.announcementTextColor,
      linkUrl: branding.announcementLinkUrl,
      startsAt: branding.announcementStartsAt,
      endsAt: branding.announcementEndsAt,
      displayOrder: 0,
    }],
  };
}
