import type { ID } from "../domain/common";

export interface NotificationResult {
  success: boolean;
  message: string;
}

export interface NotificationService {
  /**
   * Placeholder for the future notification platform.
   *
   * Actual channel resolution and delivery will eventually be handled
   * by the backend notification service.
   */
  notifyCustomersForOffer(
    organizationId: ID,
    offerId: ID,
  ): Promise<NotificationResult>;
}
