import type { ConfigContext, ExpoConfig } from "expo/config";

function configuredHost(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;

  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const name = config.name;
  const slug = config.slug;
  if (!name || !slug) {
    throw new Error(
      "Expo base configuration must define an application name and slug.",
    );
  }

  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  const configuredWebHost = configuredHost(process.env.EXPO_PUBLIC_WEB_BASE_URL);
  const environmentHost =
    environment === "dev"
      ? "memgine-dev.mynikatech.in"
      : environment === "prod"
        ? "memgine.mynikatech.in"
        : undefined;
  const appLinkHost = configuredWebHost ?? environmentHost;

  const appLinkIntentFilters = appLinkHost
    ? [
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: [
            { scheme: "https", host: appLinkHost, pathPrefix: "/qr" },
            { scheme: "https", host: appLinkHost, pathPrefix: "/discover" },
            { scheme: "https", host: appLinkHost, pathPrefix: "/join" },
          ],
        },
      ]
    : [];

  return {
    ...config,
    name,
    slug,
    ios: {
      ...config.ios,
      associatedDomains: appLinkHost
        ? [...(config.ios?.associatedDomains ?? []), `applinks:${appLinkHost}`]
        : config.ios?.associatedDomains,
    },
    android: {
      ...config.android,
      intentFilters: appLinkHost
        ? [...(config.android?.intentFilters ?? []), ...appLinkIntentFilters]
        : config.android?.intentFilters,
    },
  };
};
