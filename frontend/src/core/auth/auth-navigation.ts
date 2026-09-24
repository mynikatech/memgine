import type { AuthSession } from "@/src/data/api/auth-api";
import { APP_ROUTES } from "@/src/constants/navigation";
import { Platform } from "react-native";

export type AuthWorkspace = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
};

export function authWorkspaces(session: AuthSession): AuthWorkspace[] {
  const workspaces: AuthWorkspace[] = [];
  if (session.access.some((item) => item.capabilities.includes("PLATFORM_ADMIN_ACCESS"))) {
    workspaces.push({ key: "platform", title: "Platform Admin", subtitle: "Memgine Console", href: APP_ROUTES.platformAdmin.root });
  }
  session.access.forEach((context) => {
    if (!context.organizationId) return;
    const organizationName = context.organizationName ?? context.organizationId;
    if (context.capabilities.includes("ORG_ADMIN_ACCESS")) {
      workspaces.push({
        key: `admin:${context.organizationId}`,
        title: organizationName,
        subtitle: "Organization Admin",
        href: APP_ROUTES.orgAdmin.organization(context.organizationId),
      });
    }
    if (context.capabilities.includes("COUNTER_ACCESS")) {
      workspaces.push({
        key: `counter:${context.organizationId}`,
        title: organizationName,
        subtitle: "Counter",
        href: APP_ROUTES.counter.organization(context.organizationId),
      });
    }
  });
  return workspaces;
}

export function landingFor(session: AuthSession): string {
  const choices = authWorkspaces(session);
  return choices.length === 1 ? choices[0].href : APP_ROUTES.workspaces;
}

/** Keep native sign-out and unauthenticated guards in the neutral entry flow. */
export function unauthenticatedLanding(): string {
  return Platform.OS === "web" ? APP_ROUTES.login : APP_ROUTES.mobileEntry;
}
