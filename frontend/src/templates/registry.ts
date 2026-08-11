import {
  CustomerNavKey,
  F_AND_B_BAKERY_V1,
  SecondarySectionKey,
  StaffNavKey,
  TemplateComponentKey,
  TemplateDefinition,
} from "@/src/core";

/**
 * Lightweight Template Registry over the frozen Stage 2A TemplateDefinition.
 * Resolves templateId → TemplateDefinition → allowed navigation / sections /
 * components / configurable options. Only f-and-b-bakery-v1 is registered.
 * This is NOT a page builder and grants no arbitrary navigation/pages.
 */
const REGISTRY: Record<string, TemplateDefinition> = {
  [F_AND_B_BAKERY_V1.id]: F_AND_B_BAKERY_V1,
};

export function getTemplate(templateId: string): TemplateDefinition | undefined {
  return REGISTRY[templateId];
}

export function resolveTemplate(templateId: string): TemplateDefinition {
  const template = REGISTRY[templateId];
  if (!template) throw new Error(`Unknown templateId: ${templateId}`);
  return template;
}

export function listTemplates(): TemplateDefinition[] {
  return Object.values(REGISTRY);
}

export function getCustomerNavigation(template: TemplateDefinition): CustomerNavKey[] {
  return template.customerNavigation;
}

export function getStaffNavigation(template: TemplateDefinition): StaffNavKey[] {
  return template.staffNavigation;
}

export function getSecondarySections(template: TemplateDefinition): SecondarySectionKey[] {
  return template.secondarySections;
}

export function isSectionConfigurable(
  template: TemplateDefinition,
  section: SecondarySectionKey,
): boolean {
  return template.configurableSections.includes(section);
}

export function isComponentAllowed(
  template: TemplateDefinition,
  component: TemplateComponentKey,
): boolean {
  return template.allowedComponents.includes(component);
}
