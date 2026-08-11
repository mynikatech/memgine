import { MockMemgineService } from "./mockService";
import type { MemgineService } from "./types";

export * from "./types";

/**
 * The app's single service entry point. Today a mock; swap this line for a REST
 * client (same MemgineService interface) to go live — no component changes.
 */
export const service: MemgineService = new MockMemgineService();
