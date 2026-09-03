import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { ID, Product } from "@/src/core";

import type { ProductRepository } from "./product-repository";

function sampleProducts(organizationId: ID): Product[] {
  const now = new Date().toISOString();

  return [
    {
      id: `product-${organizationId}-001`,
      organizationId,
      productCode: "PROD-001",
      productName: "Cappuccino",
      description: "Freshly prepared cappuccino.",
      statusId: "status-active",
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      isDeleted: false,
      versionNo: 1,
    },
    {
      id: `product-${organizationId}-002`,
      organizationId,
      productCode: "PROD-002",
      productName: "Croissant",
      description: "Fresh butter croissant.",
      statusId: "status-active",
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      isDeleted: false,
      versionNo: 1,
    },
    {
      id: `product-${organizationId}-003`,
      organizationId,
      productCode: "PROD-003",
      productName: "Chocolate Cake",
      description: "Chocolate cake slice.",
      statusId: "status-active",
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      isDeleted: false,
      versionNo: 1,
    },
    {
      id: `product-${organizationId}-004`,
      organizationId,
      productCode: "PROD-004",
      productName: "Grilled Sandwich",
      description: "Freshly prepared grilled sandwich.",
      statusId: "status-active",
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      isDeleted: false,
      versionNo: 1,
    },
  ];
}

export class LocalProductRepository implements ProductRepository {
  async get(organizationId: ID, productId: ID): Promise<Product | null> {
    const products = await this.list(organizationId);

    return (
      products.find(
        (product) => product.id === productId && !product.isDeleted,
      ) ?? null
    );
  }

  async list(organizationId: ID): Promise<Product[]> {
    const key = LOCAL_DATA_KEYS.products(organizationId);

    const existing = await asyncStorageStore.get<Product[]>(key);

    if (existing) {
      return existing;
    }

    const seeded = sampleProducts(organizationId);

    await asyncStorageStore.set(key, seeded);

    return seeded;
  }

  async create(product: Product): Promise<Product> {
    const products = await this.list(product.organizationId);

    if (
      products.some(
        (item) =>
          !item.isDeleted &&
          item.productCode.toLowerCase() === product.productCode.toLowerCase(),
      )
    ) {
      throw new Error(`Product code '${product.productCode}' already exists.`);
    }

    const updated = [...products, product];

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.products(product.organizationId),
      updated,
    );

    return product;
  }

  async update(organizationId: ID, product: Product): Promise<Product> {
    const products = await this.list(organizationId);

    const index = products.findIndex(
      (item) =>
        item.id === product.id &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Product not found.");
    }

    const duplicateCode = products.some(
      (item) =>
        item.id !== product.id &&
        !item.isDeleted &&
        item.productCode.toLowerCase() === product.productCode.toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(`Product code '${product.productCode}' already exists.`);
    }

    const updatedProduct: Product = {
      ...product,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: products[index].versionNo + 1,
    };

    products[index] = updatedProduct;

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.products(organizationId),
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
      throw new Error("Product not found.");
    }

    products[index] = {
      ...products[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: products[index].versionNo + 1,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.products(organizationId),
      products,
    );
  }

  private async getAll(): Promise<Product[]> {
    const keys = await asyncStorageStore.get<string[]>(
      LOCAL_DATA_KEYS.productOrganizations(),
    );

    if (!keys || keys.length === 0) {
      return [];
    }

    const results = await Promise.all(
      keys.map((organizationId) =>
        asyncStorageStore.get<Product[]>(
          LOCAL_DATA_KEYS.products(organizationId),
        ),
      ),
    );

    return results.flatMap((items) => items ?? []);
  }
}
