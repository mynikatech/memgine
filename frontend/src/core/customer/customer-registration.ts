import type {
  CreateUserInput,
  Customer,
  ID,
  OrganizationUser,
  User,
  UserAcquisition,
} from "@/src/core";

import { services } from "@/src/core";

export interface RegisterCustomerInput {
  organizationId: ID;
  userInput?: CreateUserInput;
  /** Backward-compatible fields used by existing Counter/Join callers. */
  fullName?: string;
  mobile?: string;
  email?: string;
  userId?: ID;
  sourceStoreId?: ID;
  registrationSource?: string;
  registrationChannel?: string;
}

export interface RegisterCustomerResult {
  user: User;
  customer: Customer;
  organizationUser: OrganizationUser;
  acquisition?: UserAcquisition;
  createdUser: boolean;
  createdOrganizationUser: boolean;
}

const CUSTOMER_ORGANIZATION_USER_TYPE_ID = "org-user-type-customer";
const ACTIVE_ORGANIZATION_USER_STATUS_ID = "status-active";
const SYSTEM_USER_ID = "user-system";

function normalizePhoneNumber(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function phonesMatch(
  left: User["primaryPhone"],
  right: User["primaryPhone"],
): boolean {
  return (
    left.countryId === right.countryId &&
    normalizePhoneNumber(left.callingCode) ===
      normalizePhoneNumber(right.callingCode) &&
    normalizePhoneNumber(left.number) === normalizePhoneNumber(right.number)
  );
}

export async function registerCustomerForOrganization(
  input: RegisterCustomerInput,
): Promise<RegisterCustomerResult> {
  const legacyFullName = input.fullName?.trim() ?? "";
  const legacyMobile = normalizePhoneNumber(input.mobile);

  let requestedPhone = input.userInput?.primaryPhone;

  if (!requestedPhone && legacyMobile) {
    requestedPhone = {
      countryId: "",
      callingCode: "",
      number: legacyMobile,
    };
  }

  if (!requestedPhone) {
    throw new Error("Primary Phone Number is required.");
  }

  const users = await services.organization.listUsers();

  /*
   * Phone number is the identity criterion for Counter.
   *
   * We deliberately resolve the canonical User first. We never create
   * another global User when the same phone already exists.
   */
  let user: User | null = null;

  if (input.userId) {
    user = (await services.organization.getUser(input.userId)) ?? null;
  }

  if (!user) {
    user =
      users.find(
        (candidate) =>
          phonesMatch(candidate.primaryPhone, requestedPhone) ||
          (!!legacyMobile &&
            normalizePhoneNumber(candidate.primaryPhone.number) ===
              legacyMobile),
      ) ?? null;
  }

  let createdUser = false;

  if (!user) {
    const nameParts = legacyFullName.split(/\s+/).filter(Boolean);
    const firstName =
      input.userInput?.firstName?.trim() || nameParts[0] || "Customer";
    const lastName =
      input.userInput?.lastName?.trim() ||
      (nameParts.length > 1 ? nameParts[nameParts.length - 1] : "");

    user = await services.organization.createUser({
      firstName,
      middleName: input.userInput?.middleName,
      lastName,
      displayName: input.userInput?.displayName || legacyFullName || undefined,
      primaryEmail: input.userInput?.primaryEmail,
      primaryPhone: {
        countryId: requestedPhone.countryId,
        callingCode: requestedPhone.callingCode,
        number: normalizePhoneNumber(requestedPhone.number),
      },
      preferredLanguageId: input.userInput?.preferredLanguageId,
      userStatusId:
        input.userInput?.userStatusId || ACTIVE_ORGANIZATION_USER_STATUS_ID,
      createdBy: input.userInput?.createdBy || SYSTEM_USER_ID,
    });

    createdUser = true;
  }

  /*
   * Resolve the organization-specific Customer relationship.
   */
  const organizationUsers =
    await services.organization.listOrganizationUsersByUser(user.id);

  let organizationUser =
    organizationUsers.find(
      (item) =>
        !item.isDeleted &&
        item.organizationId === input.organizationId &&
        item.organizationUserTypeId === CUSTOMER_ORGANIZATION_USER_TYPE_ID,
    ) ?? null;

  let createdOrganizationUser = false;

  if (!organizationUser) {
    const now = new Date().toISOString();

    organizationUser = await services.organization.createOrganizationUser(
      input.organizationId,
      {
        id: `org-user-${Date.now().toString(36)}`,
        organizationId: input.organizationId,
        userId: user.id,
        organizationUserTypeId: CUSTOMER_ORGANIZATION_USER_TYPE_ID,
        organizationUserStatusId: ACTIVE_ORGANIZATION_USER_STATUS_ID,
        joiningDate: now,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
        isDeleted: false,
        versionNo: 1,
      },
    );

    createdOrganizationUser = true;
  }

  /*
   * UserAcquisition records where/how the customer entered the
   * organization. Counter creates its own acquisition immediately.
   *
   * If this user already has an acquisition for this organization,
   * do not create a duplicate acquisition.
   */
  const acquisitions = await services.userAcquisition.getByUser(user.id);

  let acquisition =
    acquisitions.find(
      (item) => !item.isDeleted && item.organizationId === input.organizationId,
    ) ?? undefined;

  if (!acquisition) {
    const now = new Date().toISOString();

    acquisition = await services.userAcquisition.createAcquisition({
      id: `user-acq-${Date.now().toString(36)}`,
      userId: user.id,
      organizationId: input.organizationId,
      registrationSource: input.registrationSource ?? "COUNTER",
      registrationChannel: input.registrationChannel ?? "POS",
      sourceStoreId: input.sourceStoreId,
      createdAt: now,
      createdBy: SYSTEM_USER_ID,
      updatedAt: now,
      updatedBy: SYSTEM_USER_ID,
      isDeleted: false,
      versionNo: 1,
    });
  }

  const fullName =
    user.displayName?.trim() ||
    [user.firstName, user.middleName, user.lastName]
      .filter((value) => Boolean(value?.trim()))
      .join(" ") ||
    "Customer";

  const customer = {
    id: user.id,
    fullName,
    email: user.primaryEmail,
    phone: `${user.primaryPhone.callingCode ?? ""}${user.primaryPhone.number ?? ""}`,
    createdAt: user.createdAt,
  } as Customer;

  return {
    user,
    customer,
    organizationUser,
    acquisition,
    createdUser,
    createdOrganizationUser,
  };
}
