import { storage } from "@/src/utils/storage";

import type { StorageItemValue } from "@/src/utils/storage/storage-base";

import type { ID } from "../domain/common";
import type { TemplateService, TemplateCatalogueItem } from "./template";

const CACHE_PREFIX = "memgine.templates";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  cachedAt: number;
  expiresAt: number;
  data: T;
};

export class CachedTemplateService implements TemplateService {
  constructor(
    private readonly source: TemplateService,
    private readonly ttlMs = CACHE_TTL_MS,
  ) {}

  private async getCached<T>(key: string): Promise<T | null> {
    const cached = await storage.getItem<StorageItemValue>(key, null);

    if (!cached || typeof cached !== "object" || Array.isArray(cached)) {
      return null;
    }

    const envelope = cached as Partial<CacheEnvelope<T>>;

    if (typeof envelope.expiresAt !== "number" || !("data" in envelope)) {
      await storage.removeItem(key);
      return null;
    }

    if (envelope.expiresAt <= Date.now()) {
      await storage.removeItem(key);
      return null;
    }

    return envelope.data as T;
  }

  private async setCached<T>(key: string, data: T): Promise<void> {
    const now = Date.now();

    const envelope: CacheEnvelope<T> = {
      cachedAt: now,
      expiresAt: now + this.ttlMs,
      data,
    };

    await storage.setItem(
      key,
      envelope as Parameters<typeof storage.setItem>[1],
    );
  }

  private async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getCached<T>(key);

    if (cached !== null) {
      return cached;
    }

    const data = await loader();

    await this.setCached(key, data);

    return data;
  }

  async listTemplates(): Promise<TemplateCatalogueItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.catalogue`, () =>
      this.source.listTemplates(),
    );
  }

  async getTemplate(id: ID): Promise<TemplateCatalogueItem | null> {
    const normalizedId = id.trim();

    if (!normalizedId) {
      return null;
    }

    const templates = await this.listTemplates();

    return templates.find((item) => item.id === normalizedId) ?? null;
  }

  async getDefaultTemplateForOrganizationType(
    organizationTypeId: ID,
  ): Promise<TemplateCatalogueItem | null> {
    const normalizedId = organizationTypeId.trim();

    if (!normalizedId) {
      return null;
    }

    const templates = await this.listTemplates();

    return (
      templates.find((item) => item.organizationTypeId === normalizedId) ?? null
    );
  }

  /**
   * Completely replace the template cache from the source.
   *
   * This intentionally bypasses getOrLoad().
   *
   * Therefore:
   *   constants changed → refresh() → new constants are cached
   *
   * Later:
   *   DB/API changed → refresh() → new DB/API data is cached
   */
  async refresh(): Promise<void> {
    const templates = await this.source.listTemplates();

    await this.setCached(`${CACHE_PREFIX}.catalogue`, templates);
  }
}
