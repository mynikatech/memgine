import type { ID } from "../domain/common";
import {
  DEFAULT_BUSINESS_TEMPLATES,
  getDefaultBusinessTemplate,
} from "../defaults/default-business-template";
import type {
  TemplateService,
  TemplateCatalogueItem,
} from "../services/template";
import { CachedTemplateService } from "../services/template-cache";

/**
 * Raw in-memory platform template source.
 *
 * This is the only layer that currently knows that the template catalogue
 * comes from TypeScript constants.
 *
 * Later this class can be replaced by an API/DB implementation without
 * changing the application-facing TemplateService contract.
 */
export class InMemoryTemplateService implements TemplateService {
  async listTemplates(): Promise<TemplateCatalogueItem[]> {
    return Object.values(DEFAULT_BUSINESS_TEMPLATES);
  }

  async getTemplate(id: ID): Promise<TemplateCatalogueItem | null> {
    const normalizedId = id.trim();

    if (!normalizedId) {
      return null;
    }

    return (
      Object.values(DEFAULT_BUSINESS_TEMPLATES).find(
        (item) => item.id === normalizedId,
      ) ?? null
    );
  }

  async getDefaultTemplateForOrganizationType(
    organizationTypeId: ID,
  ): Promise<TemplateCatalogueItem | null> {
    const normalizedId = organizationTypeId.trim();

    if (!normalizedId) {
      return null;
    }

    try {
      return getDefaultBusinessTemplate(normalizedId);
    } catch {
      return null;
    }
  }

  async refresh(): Promise<void> {
    /**
     * Nothing needs to be done here.
     *
     * The source is the imported TypeScript constants. Calling refresh()
     * on the CachedTemplateService causes those current constants to be
     * read again and written over the existing persisted cache.
     */
  }
}

/**
 * Raw source.
 */
export const mockTemplateSource = new InMemoryTemplateService();

/**
 * Public application-facing template service.
 *
 * UI
 *   ↓
 * services.template
 *   ↓
 * CachedTemplateService
 *   ↓
 * InMemoryTemplateService
 *   ↓
 * DEFAULT_BUSINESS_TEMPLATES
 *
 * Later only the source implementation needs to change.
 */
export const mockTemplateService = new CachedTemplateService(
  mockTemplateSource,
);
