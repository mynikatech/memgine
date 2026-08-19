import type { Customer, OrganizationUser } from "@/src/core";

import { mockServices } from "@/src/core";

export interface RegisterCustomerInput {
  organizationId: string;
  fullName: string;
  mobile: string;
  email?: string;
  customerId?: string;
}

export interface RegisterCustomerResult {
  customer: Customer;
  organizationUser: OrganizationUser;
}

/**
 * Resolve the customer and establish their relationship with the
 * organization.
 *
 * Customer-facing terminology should simply be "registration".
 *
 * Internally:
 *
 * Customer
 *    ↓
 * OrganizationUser
 *
 * This operation is intentionally idempotent:
 *
 * - existing Customer → reuse
 * - existing OrganizationUser → reuse
 * - otherwise create what is missing
 */
export async function registerCustomerForOrganization(
  input: RegisterCustomerInput,
): Promise<RegisterCustomerResult> {
  const mobile = input.mobile.trim();

  if (!mobile) {
    throw new Error("Mobile number is required.");
  }

  /*
   * --------------------------------------------------------------
   * 1. Resolve Customer
   * --------------------------------------------------------------
   */

  let customer: Customer | undefined;

  if (input.customerId) {
    customer =
      (await mockServices.customer.getCustomer(input.customerId)) ?? undefined;
  }

  /*
   * If the customer wasn't supplied/found by ID, identify them
   * using their verified mobile number.
   */
  if (!customer) {
    const matches = await mockServices.customer.findCustomers({
      phone: mobile,
    });

    customer = matches[0];
  }

  /*
   * New customer.
   */
  if (!customer) {
    customer = await mockServices.customer.createCustomer({
      fullName: input.fullName.trim(),
      phone: mobile,
      email: input.email?.trim() || undefined,
    });
  } else {
    /*
     * Existing customer is authoritative.
     *
     * We deliberately do not update their profile here because
     * CustomerService currently has no updateCustomer contract.
     */
  }

  /*
   * --------------------------------------------------------------
   * 2. Resolve OrganizationUser
   * --------------------------------------------------------------
   */

  const organizationUsers =
    await mockServices.organization.listOrganizationUsersByUser(customer.id);

  let organizationUser = organizationUsers.find(
    (item) =>
      item.organizationId === input.organizationId &&
      item.organizationUserTypeId === "org-user-type-customer" &&
      !item.isDeleted,
  );

  /*
   * Already a customer of this business.
   */
  if (organizationUser) {
    return {
      customer,
      organizationUser,
    };
  }

  /*
   * New relationship with this business.
   */
  const now = new Date().toISOString();

  organizationUser = await mockServices.organization.createOrganizationUser(
    input.organizationId,
    {
      id: `org-user-${Date.now()}`,
      organizationId: input.organizationId,
      userId: customer.id,

      organizationUserTypeId: "org-user-type-customer",
      organizationUserStatusId: "status-active",

      joiningDate: now.substring(0, 10),

      createdAt: now,
      createdBy: "user-system",

      updatedAt: now,
      updatedBy: "user-system",

      isDeleted: false,
      versionNo: 1,
    },
  );

  return {
    customer,
    organizationUser,
  };
}
