/**
 * Template Definition — Memgine-controlled. Defines the structure, allowed
 * sections, available components and permitted configuration options. A
 * business may configure WITHIN these bounds but cannot add pages, navigation,
 * custom code or unsupported components. See ARCHITECTURE.md.
 */
export type TemplateSectionKey =
  | "hero"
  | "memberships"
  | "benefits"
  | "offers"
  | "stores"
  | "activity"
  | "profile";

export interface TemplateSection {
  key: TemplateSectionKey;
  label: string;
  required?: boolean;
}

export interface TemplateConfigOption {
  key: string;
  label: string;
  type: "color" | "text" | "image" | "select" | "boolean";
  options?: string[];
}

export interface TemplateDefinition {
  id: string;
  name: string;
  version: string;
  industry: string;
  description: string;
  sections: TemplateSection[];
  availableComponents: string[];
  configOptions: TemplateConfigOption[];
}
