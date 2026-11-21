import type { PaymentConfirmation, PaymentIntent } from "@/src/data/api/counter-api";

export const fulfillmentRoute = (organizationId: string, subscriptionId: string, view: string, id: string) => ({
  pathname: "/business/fulfillment" as const,
  params: { org: organizationId, subscription: subscriptionId, view, id },
});

export function collectCompletion(confirmation?: PaymentConfirmation | null) {
  const payment = confirmation?.payment;
  if (payment?.status !== "SUCCEEDED") return undefined;
  if (payment.fulfillmentCheckout) return payment.fulfillmentCheckout.fulfillmentId ? "fulfillment" : undefined;
  return payment.membershipPlanId && confirmation?.subscription ? "membership" : undefined;
}

export function collectStatusMatchesIntent(confirmation: PaymentConfirmation, expectedIntent?: string) {
  return !!expectedIntent && confirmation.payment.paymentIntentId === expectedIntent;
}

export function collectRecoveryUrl(mode: "web" | "native", org?: string, subscription?: string, intent?: string) {
  if (!org || !subscription || !intent) return undefined;
  const params = new URLSearchParams({ fulfillmentPayment: "1", org, subscription, intent });
  return `${mode === "web" ? "/payment-return" : "memgine://payment-return"}?${params}`;
}

export function collectReloadUrl(mode: "web" | "native" | undefined, payment: PaymentIntent) {
  const context = payment.fulfillmentCheckout;
  if (!mode || !context) return "/poynt-collect/checkout";
  const params = new URLSearchParams({ fulfillmentReturn: mode, intent: payment.paymentIntentId,
    org: context.organizationId, subscription: context.subscriptionId });
  return `/poynt-collect/checkout?${params}`;
}

export function collectReturnUrl(mode: "web" | "native", payment?: PaymentIntent, cancel = false, counterConflict = false) {
  const context = payment?.fulfillmentCheckout;
  const query = new URLSearchParams();
  if (cancel) query.set("cancelPayment", "1");
  if (context) {
    if (counterConflict) query.set("counterConflict", "1");
    query.set("fulfillmentPayment", "1");
    query.set("org", context.organizationId);
    query.set("subscription", context.subscriptionId);
    query.set("intent", payment.paymentIntentId);
    if (payment.status === "SUCCEEDED" && context.fulfillmentId) query.set("view", "details");
  }
  const path = mode === "web" && context ? "/payment-return" : "memgine://payment-return";
  return query.size ? `${path}?${query.toString()}` : path;
}

export function customerFulfillmentReturnPath(value?: string) {
  return value && /^\/(?:payment-return|business\/fulfillment)\?[^#\\]*$/.test(value) ? value : undefined;
}

export function verifiedFulfillmentDestination(
  result: { fulfillment?: { id: string } | null; payment?: { paymentIntentId: string; subscriptionId: string; status: string } | null },
  org: string, intent: string, view: "details" | "confirmation", showConfirmation = false,
) {
  const payment = result.payment;
  if (!payment?.subscriptionId || payment.paymentIntentId !== intent) return undefined;
  if (payment.status !== "SUCCEEDED" || !result.fulfillment?.id) return fulfillmentRoute(org, payment.subscriptionId, "payment", intent);
  const route = fulfillmentRoute(org, payment.subscriptionId, view, result.fulfillment.id);
  return showConfirmation && view === "details" ? { ...route, params: { ...route.params, confirmed: "1" } } : route;
}
