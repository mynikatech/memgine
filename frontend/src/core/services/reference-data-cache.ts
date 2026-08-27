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

export class ReferenceDataCache {
  private snapshot: ReferenceDataService | null = null;

  set(service: ReferenceDataService): void {
    this.snapshot = service;
  }

  get(): ReferenceDataService {
    if (!this.snapshot) {
      throw new Error("Reference data cache has not been initialized.");
    }

    return this.snapshot;
  }

  clear(): void {
    this.snapshot = null;
  }
}

export const referenceDataCache = new ReferenceDataCache();

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

  /**
   * Completely refresh the reference-data cache from the source.
   *
   * This deliberately does NOT use getOrLoad().
   *
   * The purpose of refresh is to replace whatever is currently cached,
   * including an empty or stale cached array.
   */
  async refresh(): Promise<void> {
    const [
      countries,
      languages,
      organizationTypes,
      organizationUserTypes,
      storeTypes,
      productCategories,
      productTypes,
      benefitCategories,
      benefitTypes,
      currencies,
      integrationTypes,
    ] = await Promise.all([
      this.source.listCountries(),
      this.source.listLanguages(),
      this.source.listOrganizationTypes(),
      this.source.listOrganizationUserTypes(),
      this.source.listStoreTypes(),
      this.source.listProductCategories(),
      this.source.listProductTypes(),
      this.source.listBenefitCategories(),
      this.source.listBenefitTypes(),
      this.source.listCurrencies(),
      this.source.listIntegrationTypes(),
    ]);

    /*
     * Replace all ordinary reference-data cache entries.
     *
     * Do not use getOrLoad() here. Refresh must always go to the source,
     * even when an existing cache entry is present.
     */
    await Promise.all([
      this.setCached(`${CACHE_PREFIX}.countries`, countries),
      this.setCached(`${CACHE_PREFIX}.languages`, languages),
      this.setCached(`${CACHE_PREFIX}.organization-types`, organizationTypes),
      this.setCached(
        `${CACHE_PREFIX}.organization-user-types`,
        organizationUserTypes,
      ),
      this.setCached(`${CACHE_PREFIX}.store-types`, storeTypes),
      this.setCached(`${CACHE_PREFIX}.product-categories`, productCategories),
      this.setCached(`${CACHE_PREFIX}.product-types`, productTypes),
      this.setCached(`${CACHE_PREFIX}.benefit-categories`, benefitCategories),
      this.setCached(`${CACHE_PREFIX}.benefit-types`, benefitTypes),
      this.setCached(`${CACHE_PREFIX}.currencies`, currencies),
      this.setCached(`${CACHE_PREFIX}.integration-types`, integrationTypes),
    ]);

    /*
     * Geography is hierarchical:
     *
     * Country
     *   -> Regions
     *        -> Cities
     *
     * Refresh the complete currently configured geography from the source.
     */
    await Promise.all(
      countries.map(async (country) => {
        const regions = await this.source.listRegions(country.countryCode);

        await this.setCached(
          `${CACHE_PREFIX}.regions.${country.countryCode}`,
          regions,
        );

        await Promise.all(
          regions.map(async (region) => {
            const cities = await this.source.listCities(
              country.countryCode,
              region.code,
            );

            await this.setCached(
              `${CACHE_PREFIX}.cities.${country.countryCode}.${region.code}`,
              cities,
            );
          }),
        );
      }),
    );
  }

  async listCountries(): Promise<CountryReference[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.countries`, () =>
      this.source.listCountries(),
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

  async listLanguages(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.languages`, () =>
      this.source.listLanguages(),
    );
  }

  async listOrganizationTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.organization-types`, () =>
      this.source.listOrganizationTypes(),
    );
  }

  async listOrganizationUserTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.organization-user-types`, () =>
      this.source.listOrganizationUserTypes(),
    );
  }

  async listStoreTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.store-types`, () =>
      this.source.listStoreTypes(),
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

  async listCurrencies(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.currencies`, () =>
      this.source.listCurrencies(),
    );
  }

  async listIntegrationTypes(): Promise<ReferenceDataItem[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.integration-types`, () =>
      this.source.listIntegrationTypes(),
    );
  }
}
