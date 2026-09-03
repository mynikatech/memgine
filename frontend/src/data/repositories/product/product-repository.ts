import type { ID } from "@/src/core/domain/common";
import type { Product } from "@/src/core/domain/entities";

export interface ProductRepository {
  get(organizationId: ID, productId: ID): Promise<Product | null>;

  list(organizationId: ID): Promise<Product[]>;

  create(product: Product): Promise<Product>;

  update(organizationId: ID, product: Product): Promise<Product>;

  delete(organizationId: ID, productId: ID): Promise<void>;
}
