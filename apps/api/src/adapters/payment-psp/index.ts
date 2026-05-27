export interface CreateCheckoutOpts {
  referenceId: string;
  amountZar: number;
  buyerName: string;
  description: string;
  cancelUrl: string;
  successUrl: string;
}

export interface CheckoutResult {
  paymentId: string;
  checkoutUrl: string;
}

export interface PspAdapter {
  createCheckout(opts: CreateCheckoutOpts): Promise<CheckoutResult>;
  releaseEscrow(paymentId: string): Promise<void>;
  refund(paymentId: string): Promise<void>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
}

export function getPspAdapter(): PspAdapter {
  const provider = process.env["PSP_PROVIDER"] ?? "mock";
  if (provider === "mock") {
    return new MockPspAdapter();
  }
  throw new Error(`Unsupported PSP_PROVIDER: ${provider}. Supported: mock`);
}

class MockPspAdapter implements PspAdapter {
  async createCheckout(opts: CreateCheckoutOpts): Promise<CheckoutResult> {
    const paymentId = `mock_pay_${opts.referenceId}_${Date.now()}`;
    const checkoutUrl = `https://pay.mock.local/checkout/${paymentId}?amount=${opts.amountZar}`;
    return { paymentId, checkoutUrl };
  }

  async releaseEscrow(paymentId: string): Promise<void> {
    console.info(`[MockPSP] Release escrow for payment ${paymentId}`);
  }

  async refund(paymentId: string): Promise<void> {
    console.info(`[MockPSP] Refund payment ${paymentId}`);
  }

  verifyWebhookSignature(_rawBody: string, _headers: Record<string, string | string[] | undefined>): boolean {
    return true;
  }
}
