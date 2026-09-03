import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";

import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { ID, MembershipProduct } from "@/src/core";

import type { MembershipProductRepository } from "./membership-product-repository";

export class LocalMembershipProductRepository implements MembershipProductRepository {
  async list(organizationId: ID): Promise<MembershipProduct[]> {
    const key = LOCAL_DATA_KEYS.memberships(organizationId);

    const existing = await asyncStorageStore.get<MembershipProduct[]>(key);

    return existing ?? [];
  }

  async get(
    organizationId: ID,
    productId: ID,
  ): Promise<MembershipProduct | null> {
    const products = await this.list(organizationId);

    return (
      products.find(
        (product) =>
          product.id === productId &&
          product.organizationId === organizationId &&
          !product.isDeleted,
      ) ?? null
    );
  }

  async create(product: MembershipProduct): Promise<MembershipProduct> {
    const products = await this.list(product.organizationId);

    const duplicateCode = products.some(
      (item) =>
        !item.isDeleted &&
        item.membershipProductCode.trim().toLowerCase() ===
          product.membershipProductCode.trim().toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(
        `Membership product code '${product.membershipProductCode}' already exists.`,
      );
    }

    const updated = [...products, product];

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.memberships(product.organizationId),
      updated,
    );

    return product;
  }

  async update(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct> {
    const products = await this.list(organizationId);

    const index = products.findIndex(
      (item) =>
        item.id === product.id &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Membership product not found.");
    }

    const duplicateCode = products.some(
      (item) =>
        item.id !== product.id &&
        !item.isDeleted &&
        item.membershipProductCode.trim().toLowerCase() ===
          product.membershipProductCode.trim().toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(
        `Membership product code '${product.membershipProductCode}' already exists.`,
      );
    }

    const updatedProduct: MembershipProduct = {
      ...product,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: products[index].versionNo + 1,
    };

    products[index] = updatedProduct;

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.memberships(organizationId),
      products,
    );

    return updatedProduct;
  }

  async delete(organizationId: ID, productId: ID): Promise<void> {
    const products = await this.list(organizationId);

    const index = products.findIndex(
      (item) =>
        item.id === productId &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Membership product not found.");
    }

    products[index] = {
      ...products[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: products[index].versionNo + 1,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.memberships(organizationId),
      products,
    );
  }
}
