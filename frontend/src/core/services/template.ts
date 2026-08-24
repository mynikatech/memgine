import type { ID } from "../domain/common";
import type { TemplateDefaultContent } from "../template/template-content";
import type { TemplateDefinition } from "../template/template-definition";

/**
 * Platform template catalogue item.
 *
 * A template consists of:
 *   - the frozen Memgine-controlled definition
 *   - the default starter content used when a business is onboarded
 *
 * The business may customize its own content later, but it cannot change
 * the template definition itself.
 */
export interface TemplateCatalogueItem {
  id: ID;
  organizationTypeId: ID;
  template: TemplateDefinition;
  content: TemplateDefaultContent;
}

/**
 * Provider-neutral Template service.
 *
 * Current implementation:
 *   In-memory platform defaults
 *
 * Future implementation:
 *   API / database
 *
 * The UI and the rest of the application should only depend on this contract.
 */
export interface TemplateService {
  /**
   * Return all platform templates available for use.
   */
  listTemplates(): Promise<TemplateCatalogueItem[]>;

  /**
   * Return a template by its platform template ID.
   */
  getTemplate(id: ID): Promise<TemplateCatalogueItem | null>;

  /**
   * Return the platform default template for an organization type.
   */
  getDefaultTemplateForOrganizationType(
    organizationTypeId: ID,
  ): Promise<TemplateCatalogueItem | null>;

  /**
   * Replace the cached template catalogue from the underlying source.
   *
   * This is intentionally explicit so that changing the source data during
   * development does not require cache-version changes.
   */
  refresh(): Promise<void>;
}
