import type { CounterContext, CounterOrder, CounterOrderFilters, CounterOrderStore } from "@/src/data/api/counter-api";

export const counterOrderPageSize = 25;
export const counterOrderMaxOffset = 5000;

export function counterOrdersLayout(viewport: number, content: number) {
  if (viewport >= 1024 && content >= 660) return { split: true, queueFlex: 3, detailFlex: 2, padding: 28 };
  if (viewport >= 768 && content >= 620) return { split: true, queueFlex: 1.1, detailFlex: 1, padding: 20 };
  return { split: false, queueFlex: 1, detailFlex: 1, padding: 16 };
}

export function counterOrdersContext(organizationId: string, workspace?: CounterContext | null, fixedPos?: CounterContext | null) {
  const context = fixedPos ?? workspace;
  return context?.organizationId === organizationId && context.storeId && context.staffId ? context : undefined;
}

export function counterOrderStore(stores: readonly CounterOrderStore[], scope: CounterContext) {
  return stores.find(({ id, staffId }) => id === scope.storeId && staffId === scope.staffId);
}

export function changeCounterOrderFilters(current: CounterOrderFilters, patch: Partial<Omit<CounterOrderFilters, "offset">>) {
  return { ...current, ...patch, offset: 0 };
}

export function counterOrderSelection(
  scope: string | undefined, selected: { scope: string; id: string } | undefined, rows: readonly CounterOrder[], split: boolean,
) {
  if (!scope) return undefined;
  return selected?.scope === scope ? selected.id : split ? rows[0]?.id : undefined;
}

export function counterOrderDate(value: string | null | undefined, zone: string) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(date);
  } catch {
    return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  }
}

export function counterOrderKeyboardTarget(ids: readonly string[], id: string, key: string) {
  const index = ids.indexOf(id);
  if (index < 0) return undefined;
  if (key === "ArrowDown") return ids[index + 1];
  if (key === "ArrowUp") return ids[index - 1];
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  return undefined;
}
