import { foodAndBeverageTemplate } from "./foodAndBeverage";
import type { TemplateDefinition } from "./types";

/**
 * Template Registry — the catalogue of Memgine-controlled templates. Future
 * templates (Fitness, Salon, Restaurant…) register here; nothing else changes.
 */
const registry = new Map<string, TemplateDefinition>();

export function registerTemplate(template: TemplateDefinition): void {
  registry.set(template.id, template);
}

export function getTemplate(id: string): TemplateDefinition | undefined {
  return registry.get(id);
}

export function listTemplates(): TemplateDefinition[] {
  return [...registry.values()];
}

// Seed the first template family.
registerTemplate(foodAndBeverageTemplate);
