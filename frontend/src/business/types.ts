import type { Branding } from "@/src/theme/theme";

/**
 * Business Configuration — controlled by the business but constrained by its
 * template. Carries branding, which sections are enabled (and their order), and
 * simple content slots. It NEVER defines pages, navigation or components.
 */
export interface BusinessConfiguration {
  id: string;
  organizationId: string;
  templateId: string;
  branding: Branding;
  sections: string[];
  content: Record<string, string>;
}
