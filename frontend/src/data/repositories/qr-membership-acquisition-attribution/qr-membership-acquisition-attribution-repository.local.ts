import type { ID, QRMembershipAcquisitionAttribution } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { QRMembershipAcquisitionAttributionRepository } from "./qr-membership-acquisition-attribution-repository";

export class LocalQRMembershipAcquisitionAttributionRepository implements QRMembershipAcquisitionAttributionRepository {
  private async listStored(): Promise<QRMembershipAcquisitionAttribution[]> {
    return (
      (await asyncStorageStore.get<QRMembershipAcquisitionAttribution[]>(
        LOCAL_DATA_KEYS.qrMembershipAcquisitionAttributions(),
      )) ?? []
    );
  }

  async listAll(): Promise<QRMembershipAcquisitionAttribution[]> {
    return this.listStored();
  }

  async getByScanHistoryId(
    qrScanHistoryId: ID,
  ): Promise<QRMembershipAcquisitionAttribution | null> {
    const items = await this.listStored();

    return (
      items.find((item) => item.qrScanHistoryId === qrScanHistoryId) ?? null
    );
  }

  async getBySubscriptionId(
    subscriptionId: ID,
  ): Promise<QRMembershipAcquisitionAttribution | null> {
    const items = await this.listStored();

    return items.find((item) => item.subscriptionId === subscriptionId) ?? null;
  }

  async create(
    attribution: QRMembershipAcquisitionAttribution,
  ): Promise<QRMembershipAcquisitionAttribution> {
    const items = await this.listStored();

    if (items.some((item) => item.id === attribution.id)) {
      throw new Error(
        `QR acquisition attribution already exists: ${attribution.id}`,
      );
    }

    if (
      items.some((item) => item.qrScanHistoryId === attribution.qrScanHistoryId)
    ) {
      throw new Error(
        `QR scan is already attributed: ${attribution.qrScanHistoryId}`,
      );
    }

    if (
      items.some((item) => item.subscriptionId === attribution.subscriptionId)
    ) {
      throw new Error(
        `Subscription is already attributed: ${attribution.subscriptionId}`,
      );
    }

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.qrMembershipAcquisitionAttributions(),
      [...items, attribution],
    );

    return attribution;
  }
}
