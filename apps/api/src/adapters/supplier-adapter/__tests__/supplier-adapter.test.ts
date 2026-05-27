import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createSupplierAdapter } from "../index.js";
import type { QuoteRequestData } from "../index.js";
import type { Supplier } from "@prisma/client";

vi.mock("../../../shared/audit/platform.js", () => ({
  recordPlatformAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import * as audit from "../../../shared/audit/platform.js";

const makeSupplier = (overrides: Partial<Supplier> = {}): Supplier => ({
  id: "sup-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  businessName: "Ndebele Hardware Supplies",
  cipcNumber: null,
  vatNumber: null,
  primaryContactUserId: null,
  category: "hardware",
  geographicCoverage: ["ndebele"],
  integrationMechanism: "manual",
  integrationConfig: {},
  commissionRateBasisPoints: 250,
  commissionSettlementCadence: "per_transaction",
  verificationStatus: "unverified",
  ...overrides,
});

const makeRequest = (overrides: Partial<QuoteRequestData> = {}): QuoteRequestData => ({
  requestId: "req-abc-123",
  tenantSlug: "ndebele",
  requestedByUserId: "user-1",
  basket: [
    { description: "Cement bags 50kg", quantity: 20, unit: "bags" },
    { description: "River sand", quantity: 2, unit: "cubic meters" },
  ],
  responseDeadline: new Date("2026-06-01"),
  ...overrides,
});

describe("createSupplierAdapter factory", () => {
  it("returns ManualAdapter for 'manual'", () => {
    const adapter = createSupplierAdapter("manual");
    expect(adapter).toBeDefined();
  });

  it("returns ManualAdapter for unknown mechanism", () => {
    const adapter = createSupplierAdapter("fax_machine");
    expect(adapter).toBeDefined();
  });

  it("returns adapter for 'api'", () => {
    expect(createSupplierAdapter("api")).toBeDefined();
  });

  it("returns adapter for 'whatsapp_template'", () => {
    expect(createSupplierAdapter("whatsapp_template")).toBeDefined();
  });

  it("returns adapter for 'email_template'", () => {
    expect(createSupplierAdapter("email_template")).toBeDefined();
  });
});

// ── ManualAdapter ─────────────────────────────────────────────────────────

describe("ManualAdapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const adapter = createSupplierAdapter("manual");
  const supplier = makeSupplier({ integrationMechanism: "manual" });

  it("dispatchQuoteRequest succeeds and logs audit event", async () => {
    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(true);
    expect(result.externalRef).toBe("manual_req-abc-123");
    expect(vi.mocked(audit.recordPlatformAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "supplier.quote_request.dispatched",
        entityId: "req-abc-123",
        payloadJson: expect.objectContaining({ mechanism: "manual", supplierId: "sup-1" }),
      }),
    );
  });

  it("parseIncomingResponse extracts fields from manual entry payload", () => {
    const result = adapter.parseIncomingResponse(supplier, {
      requestId: "req-abc-123",
      quoteAmountZar: 14500,
      availability: "in_stock",
      leadTimeDays: 3,
      notes: "Delivered from Pretoria warehouse",
    });

    expect(result.supplierId).toBe("sup-1");
    expect(result.requestId).toBe("req-abc-123");
    expect(result.quoteAmountZar).toBe(14500);
    expect(result.availability).toBe("in_stock");
    expect(result.leadTimeDays).toBe(3);
    expect(result.rawResponseText).toBe("Delivered from Pretoria warehouse");
  });

  it("parseIncomingResponse handles missing optional fields", () => {
    const result = adapter.parseIncomingResponse(supplier, { requestId: "req-xyz" });
    expect(result.requestId).toBe("req-xyz");
    expect(result.quoteAmountZar).toBeUndefined();
    expect(result.leadTimeDays).toBeUndefined();
  });
});

// ── ApiAdapter ────────────────────────────────────────────────────────────

describe("ApiAdapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const adapter = createSupplierAdapter("api");

  it("returns error when apiEndpoint missing from config", async () => {
    const supplier = makeSupplier({ integrationMechanism: "api", integrationConfig: {} });
    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/apiEndpoint/);
  });

  it("dispatches POST and returns success with externalRef", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reference: "ext-ref-999" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const supplier = makeSupplier({
      integrationMechanism: "api",
      integrationConfig: { apiEndpoint: "https://api.supplier.co.za/quote", apiKey: "sk-test" },
    });

    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(true);
    expect(result.externalRef).toBe("ext-ref-999");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.supplier.co.za/quote");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["externalRequestId"]).toBe("req-abc-123");

    vi.unstubAllGlobals();
  });

  it("returns failure on non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    }));

    const supplier = makeSupplier({
      integrationMechanism: "api",
      integrationConfig: { apiEndpoint: "https://api.supplier.co.za/quote" },
    });

    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/503/);

    vi.unstubAllGlobals();
  });

  it("returns failure on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const supplier = makeSupplier({
      integrationMechanism: "api",
      integrationConfig: { apiEndpoint: "https://api.supplier.co.za/quote" },
    });

    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");

    vi.unstubAllGlobals();
  });

  it("parseIncomingResponse extracts standard fields", () => {
    const result = adapter.parseIncomingResponse(makeSupplier(), {
      requestId: "req-abc-123",
      totalAmountZar: 9800,
      availability: "available",
      leadTimeDays: 5,
    });

    expect(result.quoteAmountZar).toBe(9800);
    expect(result.availability).toBe("available");
    expect(result.leadTimeDays).toBe(5);
    expect(result.supplierId).toBe("sup-1");
  });
});

// ── WhatsAppAdapter ───────────────────────────────────────────────────────

describe("WhatsAppAdapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const adapter = createSupplierAdapter("whatsapp_template");

  it("returns error when whatsappPhone missing", async () => {
    const supplier = makeSupplier({ integrationMechanism: "whatsapp_template", integrationConfig: {} });
    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/whatsappPhone/);
  });

  it("returns error when WhatsApp env not configured", async () => {
    const original = { ...process.env };
    delete process.env["WHATSAPP_API_URL"];
    delete process.env["WHATSAPP_ACCESS_TOKEN"];
    delete process.env["WHATSAPP_PHONE_NUMBER_ID"];

    const supplier = makeSupplier({
      integrationMechanism: "whatsapp_template",
      integrationConfig: { whatsappPhone: "+27821234567" },
    });

    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/);

    Object.assign(process.env, original);
  });

  it("dispatches WhatsApp template message and returns externalRef", async () => {
    process.env["WHATSAPP_API_URL"] = "https://graph.facebook.com/v19.0";
    process.env["WHATSAPP_ACCESS_TOKEN"] = "wa-token";
    process.env["WHATSAPP_PHONE_NUMBER_ID"] = "12345";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.abc123" }] }),
    }));

    const supplier = makeSupplier({
      integrationMechanism: "whatsapp_template",
      integrationConfig: { whatsappPhone: "+27821234567" },
    });

    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(true);
    expect(result.externalRef).toBe("wamid.abc123");

    vi.unstubAllGlobals();
    delete process.env["WHATSAPP_API_URL"];
    delete process.env["WHATSAPP_ACCESS_TOKEN"];
    delete process.env["WHATSAPP_PHONE_NUMBER_ID"];
  });

  it("parseIncomingResponse extracts text from WhatsApp webhook and detects ZAR amount", () => {
    const whatsappPayload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              text: { body: "Hi, our quote for request req-abc-123 is R 14 500 with 5 days lead time." },
              context: { id: "req-abc-123" },
            }],
          },
        }],
      }],
    };

    const result = adapter.parseIncomingResponse(makeSupplier(), whatsappPayload);
    expect(result.quoteAmountZar).toBe(14500);
    expect(result.rawResponseText).toContain("14 500");
  });
});

// ── EmailAdapter ──────────────────────────────────────────────────────────

describe("EmailAdapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const adapter = createSupplierAdapter("email_template");

  it("returns error when email missing from config", async () => {
    const supplier = makeSupplier({ integrationMechanism: "email_template", integrationConfig: {} });
    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/email/i);
  });

  it("returns error when SMTP not configured", async () => {
    const original = process.env["SMTP_HOST"];
    delete process.env["SMTP_HOST"];

    const supplier = makeSupplier({
      integrationMechanism: "email_template",
      integrationConfig: { email: "orders@hardware.co.za" },
    });

    const result = await adapter.dispatchQuoteRequest(supplier, makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SMTP not configured/);

    if (original !== undefined) process.env["SMTP_HOST"] = original;
  });

  it("parseIncomingResponse extracts requestId and ZAR from email body", () => {
    const result = adapter.parseIncomingResponse(makeSupplier(), {
      text: "Thank you for the request. Request ID: req-abc-123. We can supply for R 9 800. Lead time: 3 working days lead.",
    });

    expect(result.requestId).toBe("req-abc-123");
    expect(result.quoteAmountZar).toBe(9800);
    expect(result.leadTimeDays).toBe(3);
  });

  it("parseIncomingResponse handles missing ZAR gracefully", () => {
    const result = adapter.parseIncomingResponse(makeSupplier(), {
      text: "We will get back to you. Request ID: req-abc-123.",
    });

    expect(result.requestId).toBe("req-abc-123");
    expect(result.quoteAmountZar).toBeUndefined();
    expect(result.leadTimeDays).toBeUndefined();
  });
});
