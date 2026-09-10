import type {
  CustomerPreference,
  ID,
  PreferenceType,
  PreferenceDataType,
} from "@/src/core";
import type { CustomerPreferenceApi } from "@/src/data/api/customer-preference-api";
import type { CustomerPreferenceService } from "./service-contracts.profile-referral.additions";

/**
 * Local reference data required by the customer preference service.
 *
 * These are reference/configuration records, not customer preference values.
 * They are used only when the local reference-data store has not yet been
 * initialized.
 */
const DEFAULT_PREFERENCE_TYPES: PreferenceType[] = [
  {
    id: "preference-type-notifications",
    preferenceTypeCode: "NOTIFICATIONS",
    preferenceTypeName: "Notifications",
    dataType: "BOOLEAN",
    defaultValue: "true",
    description: "Customer notification preference.",
    preferenceTypeStatusId: "preference-type-status-active",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "system",
    isDeleted: false,
    versionNo: 1,
  },
  {
    id: "preference-type-marketing-emails",
    preferenceTypeCode: "MARKETING_EMAILS",
    preferenceTypeName: "Marketing emails",
    dataType: "BOOLEAN",
    defaultValue: "false",
    description: "Customer marketing email preference.",
    preferenceTypeStatusId: "preference-type-status-active",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "system",
    isDeleted: false,
    versionNo: 1,
  },
];

export class LocalCustomerPreferenceService implements CustomerPreferenceService {
  constructor(private readonly api: CustomerPreferenceApi) {}

  async listPreferenceTypes(): Promise<PreferenceType[]> {
    const types = await this.api.listPreferenceTypes();

    if (types.length > 0) {
      return types.filter((item) => !item.isDeleted);
    }

    // The local MVP may start before reference data has been initialized.
    // Keep the reference-data fallback inside the service boundary so the
    // customer UI does not contain preference configuration.
    return DEFAULT_PREFERENCE_TYPES;
  }

  listByUser(userId: ID): Promise<CustomerPreference[]> {
    return this.api.listByUser(userId);
  }

  async getValue(
    userId: ID,
    preferenceTypeCode: string,
  ): Promise<string | null> {
    const types = await this.listPreferenceTypes();

    const type = types.find(
      (item) =>
        !item.isDeleted && item.preferenceTypeCode === preferenceTypeCode,
    );

    if (!type) return null;

    const preference = await this.api.getByUserAndType(userId, type.id);

    return preference?.preferenceValue ?? type.defaultValue ?? null;
  }

  async setValue(
    userId: ID,
    preferenceTypeCode: string,
    value: string,
  ): Promise<CustomerPreference> {
    const types = await this.listPreferenceTypes();

    const type = types.find(
      (item) =>
        !item.isDeleted && item.preferenceTypeCode === preferenceTypeCode,
    );

    if (!type) {
      throw new Error(
        `Preference type '${preferenceTypeCode}' is not configured.`,
      );
    }

    validatePreferenceValue(type.dataType, value);

    const existing = await this.api.getByUserAndType(userId, type.id);
    const now = new Date().toISOString();

    return this.api.save({
      id: existing?.id ?? `CUSTOMER-PREF-${userId}-${type.id}`,
      userId,
      preferenceTypeId: type.id,
      preferenceValue: value,
      preferenceStatusId:
        existing?.preferenceStatusId ?? "preference-status-active",
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? userId,
      updatedAt: now,
      updatedBy: userId,
      isDeleted: false,
      versionNo: (existing?.versionNo ?? 0) + 1,
    });
  }
}

function validatePreferenceValue(
  dataType: PreferenceDataType,
  value: string,
): void {
  switch (dataType) {
    case "BOOLEAN":
      if (value !== "true" && value !== "false") {
        throw new Error("Boolean preference must be 'true' or 'false'.");
      }
      break;

    case "INTEGER":
      if (!Number.isInteger(Number(value))) {
        throw new Error("Integer preference must contain an integer value.");
      }
      break;

    case "DECIMAL":
      if (!Number.isFinite(Number(value))) {
        throw new Error("Decimal preference must contain a numeric value.");
      }
      break;

    default:
      break;
  }
}
