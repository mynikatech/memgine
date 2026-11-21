import type { CustomerFulfillmentRequest, CustomerFulfillmentStore } from "@/src/data/api/customer-data-api";

export type FulfillmentStoreName = Pick<CustomerFulfillmentStore, "id" | "name">;

export function storeOptions(eligible: CustomerFulfillmentStore[], known: Record<string, string>) {
  const eligibleIds = new Set(eligible.map(({ id }) => id));
  return [
    ...eligible.map(({ id, name }) => ({ id, name, eligible: true })),
    ...Object.entries(known).filter(([id]) => !eligibleIds.has(id))
      .map(([id, name]) => ({ id, name, eligible: false })),
  ];
}

export function selectedFulfillmentStore(eligible: CustomerFulfillmentStore[] | undefined, selectedId?: string) {
  return eligible?.find(({ id }) => id === selectedId) ?? (eligible?.length === 1 ? eligible[0] : undefined);
}

export function storeConflictMessage(
  items: [key: string, name: string][],
  availability: Record<string, FulfillmentStoreName[]>,
) {
  const details = items.map(([key, name]) => {
    const stores = availability[key];
    if (!stores) return name;
    return `${name} (${stores.map((store) => store.name).join(", ") || "no eligible Store"})`;
  }).join("; ");
  return `No Store can redeem ${items.length === 1 ? "this item" : "these items together"}. ${details}. Change your selection and try again.`;
}

export function fulfillmentProductScope(
  store: CustomerFulfillmentStore | undefined,
  journey: CustomerFulfillmentStore["journeys"][number] | undefined,
) {
  const options = journey === "ADVANCE_PAY_NOW" ? store?.payNowProducts : store?.products;
  return { options, key: JSON.stringify([store?.id, journey, options]) };
}

export function fulfillmentReviewScope(organizationId: string, request: CustomerFulfillmentRequest) {
  return JSON.stringify([organizationId, request.selection, request.storeId, request.journey,
    request.productSelections, request.requestKey]);
}
