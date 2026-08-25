import type { ID } from "../domain/common";
import type {
  NotificationResult,
  NotificationService,
} from "../services/notification";

/**
 * Development placeholder.
 *
 * No notification is actually sent.
 *
 * This exists so the UI already talks to a provider-neutral service
 * boundary and will not need to change when the real notification
 * backend is introduced.
 */
export class MockNotificationService implements NotificationService {
  async notifyCustomersForOffer(
    _organizationId: ID,
    _offerId: ID,
  ): Promise<NotificationResult> {
    return {
      success: true,
      message:
        "Notification request accepted. Customer notifications are not yet connected.",
    };
  }
}

export const mockNotificationService = new MockNotificationService();
