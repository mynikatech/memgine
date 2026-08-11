import { BusinessConfiguration } from "../config/business-configuration";
import { Organization, OrganizationAccount } from "../domain/entities";
import { LocalizationContext } from "../localization/localization";
import { Principal } from "../permissions/permissions";
import { TemplateDefinition } from "../template/template-definition";

/**
 * Aggregate context the FUTURE BusinessProvider will supply to the UI.
 * This is a contract only — no provider is implemented in this stage.
 *
 * Note the strict separation carried through here:
 *   organization/account -> platform & entitlement context
 *   configuration        -> presentation/UX config
 *   template             -> what is possible
 */
export interface BusinessContext {
  organization: Organization;
  account: OrganizationAccount;
  configuration: BusinessConfiguration;
  template: TemplateDefinition;
}

/** Everything the UI needs for a given actor session. */
export interface SessionContext {
  business: BusinessContext;
  principal: Principal;
  localization: LocalizationContext;
}
