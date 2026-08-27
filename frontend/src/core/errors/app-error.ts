import type { AppErrorCode } from "./error-codes";

export type AppErrorOptions = {
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, options?: AppErrorOptions) {
    super(message);

    this.name = "AppError";
    this.code = code;
    this.details = options?.details;

    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
