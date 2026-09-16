import type { Store } from "@/src/core";

export type StoreServerDto = {
  id: string;
  organizationId: string;
  storeCode: string;
  name: string;
  storeTypeId: string;
  phoneNumber?: string | null;
  emailAddress?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timezone: string;
  storeStatusId: string;
  openingDate?: string | null;
  closingDate?: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy?: string | null;
  isDeleted: boolean;
  versionNo: number;
};

export type CreateStoreApiRequest = {
  id: string;
  storeCode: string;
  name: string;
  storeTypeId: string;
  phoneNumber?: string | null;
  emailAddress?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timezone: string;
  storeStatusId: string;
  openingDate?: string | null;
  closingDate?: string | null;
};

export type UpdateStoreApiRequest = Omit<CreateStoreApiRequest, "id">;

export type DeleteStoreServerResponse = {
  storeId: string;
  deleted: boolean;
};

export class StoreApiMapper {
  static fromServer(dto: StoreServerDto): Store {
    return {
      id: dto.id,
      organizationId: dto.organizationId,
      storeCode: dto.storeCode,
      name: dto.name,
      storeTypeId: dto.storeTypeId,

      phoneNumber: dto.phoneNumber
        ? {
            countryId: "",
            callingCode: "",
            number: dto.phoneNumber,
          }
        : undefined,

      emailAddress: dto.emailAddress ?? undefined,

      address: {
        line1: dto.addressLine1,
        line2: dto.addressLine2 ?? undefined,
        city: dto.city,
        region: dto.state || undefined,
        postalCode: dto.postalCode || undefined,
        countryCode: dto.country,
      },

      timezone: dto.timezone,
      storeStatusId: dto.storeStatusId,
      openingDate: dto.openingDate ?? undefined,
      closingDate: dto.closingDate ?? undefined,

      createdAt: dto.createdAt,
      createdBy: dto.createdBy,
      updatedAt: dto.updatedAt,
      updatedBy: dto.updatedBy ?? undefined,

      isDeleted: dto.isDeleted,
      versionNo: dto.versionNo,
    };
  }

  static toCreateRequest(store: Store): CreateStoreApiRequest {
    return {
      id: store.id,
      storeCode: store.storeCode,
      name: store.name,
      storeTypeId: store.storeTypeId,

      phoneNumber: store.phoneNumber
        ? `${store.phoneNumber.callingCode}${store.phoneNumber.number}`
        : null,

      emailAddress: store.emailAddress ?? null,

      addressLine1: store.address.line1,
      addressLine2: store.address.line2 ?? null,
      city: store.address.city,
      state: store.address.region ?? "",
      postalCode: store.address.postalCode ?? "",
      country: store.address.countryCode,

      timezone: store.timezone,
      storeStatusId: store.storeStatusId,

      openingDate: store.openingDate ?? null,
      closingDate: store.closingDate ?? null,
    };
  }

  static toUpdateRequest(store: Store): UpdateStoreApiRequest {
    const { id: _id, ...request } = this.toCreateRequest(store);
    return request;
  }
}
