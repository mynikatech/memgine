import { View, TextInput } from "react-native";
import { Button, Section, Text } from "@/src/ui";
import {
  DEFAULT_THEME_EXPERIENCE,
  THEME_ANIMATIONS,
  THEME_ART_STYLES,
  resolveThemeExperience,
  type ThemeExperienceConfig,
} from "@/src/core/theme-experience.types";

type Props = {
  value?: ThemeExperienceConfig | null;
  disabled?: boolean;
  onChange: (value: ThemeExperienceConfig) => void;
};

const label = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function ThemeExperienceEditor({
  value,
  disabled = false,
  onChange,
}: Props) {
  const config = resolveThemeExperience(value);

  const patch = (changes: Partial<ThemeExperienceConfig>) =>
    onChange({ ...config, ...changes });

  const toggle = (
    key: keyof Pick<
      ThemeExperienceConfig,
      | "enabled"
      | "headerEnabled"
      | "announcementEnabled"
      | "featureEnabled"
      | "membershipAccentEnabled"
    >,
    text: string,
  ) => (
    <Button
      label={`${config[key] ? "✓ " : ""}${text}`}
      variant={config[key] ? "primary" : "secondary"}
      disabled={disabled}
      onPress={() => patch({ [key]: !config[key] })}
    />
  );

  return (
    <Section
      title="Theme Experience"
      description="Decorations for any event, season or campaign. Changes become customer-facing only after publishing."
    >
      <View style={{ gap: 16 }}>
        {toggle("enabled", "Enable Theme Experience")}

        {config.enabled ? (
          <>
            <Text variant="bodyStrong">Where should decorations appear?</Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {toggle("headerEnabled", "Shared Header")}
              {toggle("announcementEnabled", "Announcement")}
              {toggle("featureEnabled", "Feature Section")}
              {toggle("membershipAccentEnabled", "Membership Accent")}
            </View>

            <Text variant="bodyStrong">Decoration artwork</Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {THEME_ART_STYLES.map((style) => (
                <Button
                  key={style}
                  label={label(style)}
                  disabled={disabled}
                  variant={config.artStyle === style ? "primary" : "secondary"}
                  onPress={() => patch({ artStyle: style })}
                />
              ))}
            </View>

            {config.featureEnabled ? (
              <>
                <Text variant="bodyStrong">Feature section heading</Text>

                <TextInput
                  value={config.featureTitle}
                  editable={!disabled}
                  placeholder="Something special for you"
                  onChangeText={(featureTitle) =>
                    patch({ featureTitle: featureTitle.slice(0, 160) })
                  }
                />

                <Text variant="bodyStrong">Feature section message</Text>

                <TextInput
                  value={config.featureSubtitle}
                  editable={!disabled}
                  placeholder="Explore what's new"
                  onChangeText={(featureSubtitle) =>
                    patch({ featureSubtitle: featureSubtitle.slice(0, 160) })
                  }
                />
              </>
            ) : null}

            <Text variant="bodyStrong">
              Animation on opening the customer experience
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {THEME_ANIMATIONS.map((preset) => (
                <Button
                  key={preset}
                  label={label(preset)}
                  disabled={disabled}
                  variant={
                    config.animationPreset === preset ? "primary" : "secondary"
                  }
                  onPress={() => patch({ animationPreset: preset })}
                />
              ))}
            </View>

            <Text variant="bodySmall" color="textMuted">
              Animation plays once for approximately 2–3 seconds. It does not
              affect announcement rotation or payment actions.
            </Text>
          </>
        ) : null}
      </View>
    </Section>
  );
}
