/**
 * In-memory marker for a native Poynt Collect browser session.
 *
 * This marker is intentionally NOT persisted.
 * If the application process restarts, the normal payment-return
 * route must use the existing durable payment recovery records.
 */

const activeReturns = new Map<string, symbol>();

export function beginNativeCollectReturn(userId: string): () => void {
  const token = Symbol("native-collect-return");
  activeReturns.set(userId, token);

  return () => {
    if (activeReturns.get(userId) === token) {
      activeReturns.delete(userId);
    }
  };
}

export function hasActiveNativeCollectReturn(userId: string): boolean {
  return activeReturns.has(userId);
}
