import type {
  PaymentRequest,
  PaymentResult,
  PaymentService,
} from "./service-contracts";

/**
 * Local adapter for development.
 *
 * The UI and application flow depend only on PaymentService. A real
 * provider adapter can replace this implementation without changing JoinFlow.
 */
export class LocalPaymentService implements PaymentService {
  constructor(private readonly fallback: PaymentService) {}

  async pay(request: PaymentRequest): Promise<PaymentResult> {
    return this.fallback.pay(request);
  }
}
