import { storage } from "@/src/utils/storage";
import type { StorageItemValue } from "@/src/utils/storage/storage-base";

import type {
  CityReference,
  CountryReference,
  ReferenceDataItem,
  ReferenceDataService,
  RegionReference,
} from "./reference-data";

const CACHE_PREFIX = "memgine.reference-data";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  cachedAt: number;
  expiresAt: number;
  data: T;
};

export class CachedReferenceDataService implements ReferenceDataService {
  constructor(
    private readonly source: ReferenceDataService,
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

  private async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getCached<T>(key);

    if (cached !== null) {
      return cached;
    }

    const data = await loader();

    const envelope: CacheEnvelope<T> = {
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
      data,
    };

    await storage.setItem(
      key,
      envelope as Parameters<typeof storage.setItem>[1],
    );

    return data;
  }

  async listCountries(): Promise<CountryReference[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.countries`, () =>
      this.source.listCountries(),
    );
  }

  async listOrganizationTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.organization-types`, () =>
      this.source.listOrganizationTypes(),
    );
  }

  async listRegions(countryCode: string): Promise<RegionReference[]> {
    const normalized = countryCode.trim().toUpperCase();

    return this.getOrLoad(`${CACHE_PREFIX}.regions.${normalized}`, () =>
      this.source.listRegions(normalized),
    );
  }

  async listCities(
    countryCode: string,
    regionCode: string,
  ): Promise<CityReference[]> {
    const country = countryCode.trim().toUpperCase();

    const region = regionCode.trim().toUpperCase();

    return this.getOrLoad(`${CACHE_PREFIX}.cities.${country}.${region}`, () =>
      this.source.listCities(country, region),
    );
  }

  async listThemeTemplates(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.theme-templates`, () =>
      this.source.listThemeTemplates(),
    );
  }

  async listIntegrationTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.integration-types`, () =>
      this.source.listIntegrationTypes(),
    );
  }

  async listStoreTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.store-types`, () =>
      this.source.listStoreTypes(),
    );
  }

  async listBenefitCategories(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.benefit-categories`, () =>
      this.source.listBenefitCategories(),
    );
  }

  async listBenefitTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.benefit-types`, () =>
      this.source.listBenefitTypes(),
    );
  }

  async listProductCategories(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.product-categories`, () =>
      this.source.listProductCategories(),
    );
  }

  async listProductTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.product-types`, () =>
      this.source.listProductTypes(),
    );
  }

  async listCurrencies(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.currencies`, () =>
      this.source.listCurrencies(),
    );
  }
}
