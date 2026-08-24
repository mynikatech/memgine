import { CachedStatusService } from "../services/status-cache";
import { InMemoryStatusService } from "./mock-status-service";

/**
 * Raw mock status source.
 *
 * This is the in-memory implementation of the canonical StatusService.
 *
 * Production will replace this source with an API-backed StatusService.
 */
export const mockStatusSource = new InMemoryStatusService();

/**
 * Public status service used by the application registry.
 *
 * UI
 *   ↓
 * services.status
 *   ↓
 * CachedStatusService
 *   ↓
 * InMemoryStatusService
 */
export const mockStatusService = new CachedStatusService(mockStatusSource);
