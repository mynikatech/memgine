export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;

  info(message: string, context?: LogContext): void;

  warn(message: string, context?: LogContext): void;

  error(message: string, context?: LogContext): void;
}

function write(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: LogContext,
): void {
  const payload = context
    ? {
        message,
        ...context,
      }
    : message;

  switch (level) {
    case "debug":
      console.debug("[Memgine]", payload);
      break;

    case "info":
      console.info("[Memgine]", payload);
      break;

    case "warn":
      console.warn("[Memgine]", payload);
      break;

    case "error":
      console.error("[Memgine]", payload);
      break;
  }
}

export const logger: Logger = {
  debug: (message, context) => write("debug", message, context),

  info: (message, context) => write("info", message, context),

  warn: (message, context) => write("warn", message, context),

  error: (message, context) => write("error", message, context),
};
