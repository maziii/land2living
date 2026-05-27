import type { Supplier } from "@prisma/client";
import { recordPlatformAuditEvent } from "../../shared/audit/platform.js";

export interface BasketItem {
  description: string;
  quantity: number;
  unit?: string;
  specNotes?: string;
}

export interface QuoteRequestData {
  requestId: string;
  tenantSlug: string;
  requestedByUserId: string;
  basket: BasketItem[];
  responseDeadline: Date;
}

export interface DispatchResult {
  success: boolean;
  externalRef?: string;
  error?: string;
}

export interface ParsedQuoteResponse {
  supplierId: string;
  requestId: string;
  quoteAmountZar?: number;
  availability?: string;
  leadTimeDays?: number;
  rawResponseText: string;
  parsedResponseJson: Record<string, unknown>;
}

export interface SupplierAdapter {
  dispatchQuoteRequest(supplier: Supplier, request: QuoteRequestData): Promise<DispatchResult>;
  parseIncomingResponse(supplier: Supplier, payload: unknown): ParsedQuoteResponse;
}

export function createSupplierAdapter(mechanism: string): SupplierAdapter {
  switch (mechanism) {
    case "api":               return new ApiAdapter();
    case "whatsapp_template": return new WhatsAppAdapter();
    case "email_template":    return new EmailAdapter();
    case "manual":            return new ManualAdapter();
    default:                  return new ManualAdapter();
  }
}

// ── API Adapter ─────────────────────────────────────────────────────────────

class ApiAdapter implements SupplierAdapter {
  async dispatchQuoteRequest(supplier: Supplier, request: QuoteRequestData): Promise<DispatchResult> {
    const config = supplier.integrationConfig as Record<string, unknown>;
    const endpoint = config["apiEndpoint"] as string | undefined;
    const apiKey = config["apiKey"] as string | undefined;

    if (!endpoint) {
      return { success: false, error: "Supplier missing apiEndpoint in integrationConfig" };
    }

    const body = JSON.stringify({
      externalRequestId: request.requestId,
      tenantSlug: request.tenantSlug,
      basket: request.basket,
      responseDeadline: request.responseDeadline.toISOString(),
    });

    let result: DispatchResult;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        result = { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      } else {
        const json = (await res.json()) as Record<string, unknown>;
        const externalRef = typeof json["reference"] === "string" ? json["reference"] : undefined;
        result = { success: true, ...(externalRef !== undefined ? { externalRef } : {}) };
      }
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    void recordPlatformAuditEvent({
      eventType: "supplier.quote_request.dispatched",
      actorUserId: request.requestedByUserId,
      entityType: "SupplierQuoteRequest",
      entityId: request.requestId,
      payloadJson: { mechanism: "api", supplierId: supplier.id, success: result.success },
    });

    return result;
  }

  parseIncomingResponse(supplier: Supplier, payload: unknown): ParsedQuoteResponse {
    const body = payload as Record<string, unknown>;
    const requestId = typeof body["requestId"] === "string" ? body["requestId"] : "";
    const quoteAmountZar = typeof body["totalAmountZar"] === "number" ? body["totalAmountZar"] : undefined;
    const availability = typeof body["availability"] === "string" ? body["availability"] : undefined;
    const leadTimeDays = typeof body["leadTimeDays"] === "number" ? body["leadTimeDays"] : undefined;

    return {
      supplierId: supplier.id,
      requestId,
      rawResponseText: JSON.stringify(payload),
      parsedResponseJson: body,
      ...(quoteAmountZar !== undefined ? { quoteAmountZar } : {}),
      ...(availability !== undefined ? { availability } : {}),
      ...(leadTimeDays !== undefined ? { leadTimeDays } : {}),
    };
  }
}

// ── WhatsApp Template Adapter ────────────────────────────────────────────────

class WhatsAppAdapter implements SupplierAdapter {
  async dispatchQuoteRequest(supplier: Supplier, request: QuoteRequestData): Promise<DispatchResult> {
    const config = supplier.integrationConfig as Record<string, unknown>;
    const phoneNumber = config["whatsappPhone"] as string | undefined;
    const templateName = (config["templateName"] as string | undefined) ?? "supplier_quote_request";

    if (!phoneNumber) {
      return { success: false, error: "Supplier missing whatsappPhone in integrationConfig" };
    }

    const apiUrl = process.env["WHATSAPP_API_URL"] ?? "";
    const accessToken = process.env["WHATSAPP_ACCESS_TOKEN"] ?? "";
    const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? "";

    if (!apiUrl || !accessToken || !phoneNumberId) {
      void recordPlatformAuditEvent({
        eventType: "supplier.quote_request.dispatched",
        actorUserId: request.requestedByUserId,
        entityType: "SupplierQuoteRequest",
        entityId: request.requestId,
        payloadJson: { mechanism: "whatsapp_template", supplierId: supplier.id, success: false, error: "WhatsApp env not configured" },
      });
      return { success: false, error: "WhatsApp API not configured" };
    }

    const basketSummary = request.basket
      .map((item) => `${item.quantity}x ${item.description}${item.unit ? ` (${item.unit})` : ""}`)
      .join(", ");

    const body = JSON.stringify({
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: request.requestId },
              { type: "text", text: supplier.businessName },
              { type: "text", text: basketSummary },
              { type: "text", text: request.responseDeadline.toISOString().split("T")[0] },
            ],
          },
        ],
      },
    });

    let result: DispatchResult;
    try {
      const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        result = { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      } else {
        const json = (await res.json()) as Record<string, unknown>;
        const messages = json["messages"] as Array<Record<string, unknown>> | undefined;
        const externalRef = messages?.[0]?.["id"];
        result = {
          success: true,
          ...(typeof externalRef === "string" ? { externalRef } : {}),
        };
      }
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    void recordPlatformAuditEvent({
      eventType: "supplier.quote_request.dispatched",
      actorUserId: request.requestedByUserId,
      entityType: "SupplierQuoteRequest",
      entityId: request.requestId,
      payloadJson: { mechanism: "whatsapp_template", supplierId: supplier.id, success: result.success },
    });

    return result;
  }

  parseIncomingResponse(supplier: Supplier, payload: unknown): ParsedQuoteResponse {
    // WhatsApp webhook delivers a statuses/messages wrapper; extract text content
    const body = payload as Record<string, unknown>;
    const entry = body["entry"] as Array<Record<string, unknown>> | undefined;
    const changes = entry?.[0]?.["changes"] as Array<Record<string, unknown>> | undefined;
    const value = changes?.[0]?.["value"] as Record<string, unknown> | undefined;
    const messages = value?.["messages"] as Array<Record<string, unknown>> | undefined;
    const message = messages?.[0] ?? {};
    const text = (message["text"] as Record<string, unknown> | undefined)?.["body"];
    const rawResponseText = typeof text === "string" ? text : JSON.stringify(payload);

    // Best-effort parse: "R 1 500" or "R1500" — require digit as first captured char to avoid matching mid-word "r"
    const amountMatch = rawResponseText.match(/\bR\s?(\d[\d\s,]*)/i);
    const quoteAmountZar = amountMatch
      ? parseInt(amountMatch[1]!.replace(/[\s,]/g, ""), 10) || undefined
      : undefined;

    const contextId = (message["context"] as Record<string, unknown> | undefined)?.["id"];
    const requestId = typeof contextId === "string" ? contextId : "";

    return {
      supplierId: supplier.id,
      requestId,
      rawResponseText,
      parsedResponseJson: body,
      ...(quoteAmountZar !== undefined ? { quoteAmountZar } : {}),
    };
  }
}

// ── Email Template Adapter ───────────────────────────────────────────────────

class EmailAdapter implements SupplierAdapter {
  async dispatchQuoteRequest(supplier: Supplier, request: QuoteRequestData): Promise<DispatchResult> {
    const config = supplier.integrationConfig as Record<string, unknown>;
    const toEmail = config["email"] as string | undefined;

    if (!toEmail) {
      return { success: false, error: "Supplier missing email in integrationConfig" };
    }

    const smtpHost = process.env["SMTP_HOST"] ?? "";
    const smtpFrom = process.env["SMTP_FROM"] ?? "noreply@land2living.co.za";

    if (!smtpHost) {
      void recordPlatformAuditEvent({
        eventType: "supplier.quote_request.dispatched",
        actorUserId: request.requestedByUserId,
        entityType: "SupplierQuoteRequest",
        entityId: request.requestId,
        payloadJson: { mechanism: "email_template", supplierId: supplier.id, success: false, error: "SMTP not configured" },
      });
      return { success: false, error: "SMTP not configured" };
    }

    const basketHtml = request.basket
      .map(
        (item) =>
          `<tr><td>${item.description}</td><td>${item.quantity}${item.unit ? ` ${item.unit}` : ""}</td><td>${item.specNotes ?? ""}</td></tr>`,
      )
      .join("\n");

    const subject = `Quote Request ${request.requestId} — Land2Living`;
    const htmlBody = `
<p>Dear ${supplier.businessName},</p>
<p>Land2Living requests a quote for the following items (Request ID: <strong>${request.requestId}</strong>):</p>
<table border="1" cellpadding="4">
  <thead><tr><th>Description</th><th>Qty</th><th>Spec Notes</th></tr></thead>
  <tbody>${basketHtml}</tbody>
</table>
<p>Please reply to this email with your quote by <strong>${request.responseDeadline.toISOString().split("T")[0]}</strong>.</p>
<p>Include your total price (ZAR), availability, and lead time in days.</p>
<p>Reference this request ID in your reply: ${request.requestId}</p>
    `.trim();

    let result: DispatchResult;
    try {
      // Dynamically import nodemailer to keep it optional
      const nodemailer = await import("nodemailer").catch(() => null);
      if (!nodemailer) {
        result = { success: false, error: "nodemailer not available" };
      } else {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(process.env["SMTP_PORT"] ?? "587", 10),
          secure: process.env["SMTP_SECURE"] === "true",
          auth: process.env["SMTP_USER"]
            ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] ?? "" }
            : undefined,
        });

        const info = await transporter.sendMail({ from: smtpFrom, to: toEmail, subject, html: htmlBody });
        result = { success: true, externalRef: info.messageId as string };
      }
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    void recordPlatformAuditEvent({
      eventType: "supplier.quote_request.dispatched",
      actorUserId: request.requestedByUserId,
      entityType: "SupplierQuoteRequest",
      entityId: request.requestId,
      payloadJson: { mechanism: "email_template", supplierId: supplier.id, success: result.success },
    });

    return result;
  }

  parseIncomingResponse(supplier: Supplier, payload: unknown): ParsedQuoteResponse {
    // Email webhook payload (e.g., from SendGrid inbound parse or similar)
    const body = payload as Record<string, unknown>;
    const rawResponseText =
      typeof body["text"] === "string"
        ? body["text"]
        : typeof body["plain"] === "string"
          ? body["plain"]
          : JSON.stringify(payload);

    // Extract request ID — accept any alphanumeric+hyphen sequence after "Request ID:"
    const idMatch = rawResponseText.match(/\brequest\s+id[:\s]+([a-z0-9][a-z0-9-]*)/i);
    const requestId = idMatch?.[1] ?? "";

    // Best-effort ZAR extraction: require digit as first captured char to avoid mid-word "r" matches
    const amountMatch = rawResponseText.match(/\bR\s?(\d[\d\s,]*)/i);
    const quoteAmountZar = amountMatch
      ? parseInt(amountMatch[1]!.replace(/[\s,]/g, ""), 10) || undefined
      : undefined;

    const leadMatch = rawResponseText.match(/(\d+)\s*(?:working\s+)?days?\s*lead/i);
    const leadTimeDays = leadMatch ? parseInt(leadMatch[1]!, 10) : undefined;

    return {
      supplierId: supplier.id,
      requestId,
      rawResponseText,
      parsedResponseJson: body,
      ...(quoteAmountZar !== undefined ? { quoteAmountZar } : {}),
      ...(leadTimeDays !== undefined ? { leadTimeDays } : {}),
    };
  }
}

// ── Manual Adapter ───────────────────────────────────────────────────────────

class ManualAdapter implements SupplierAdapter {
  async dispatchQuoteRequest(supplier: Supplier, request: QuoteRequestData): Promise<DispatchResult> {
    // Manual: record intent in audit log; staff handles dispatch offline
    void recordPlatformAuditEvent({
      eventType: "supplier.quote_request.dispatched",
      actorUserId: request.requestedByUserId,
      entityType: "SupplierQuoteRequest",
      entityId: request.requestId,
      payloadJson: {
        mechanism: "manual",
        supplierId: supplier.id,
        note: "Manual dispatch — staff must contact supplier directly",
        success: true,
      },
    });

    return {
      success: true,
      externalRef: `manual_${request.requestId}`,
    };
  }

  parseIncomingResponse(supplier: Supplier, payload: unknown): ParsedQuoteResponse {
    // Manual entry: payload is expected to be a pre-structured object from council staff
    const body = payload as Record<string, unknown>;
    const requestId = typeof body["requestId"] === "string" ? body["requestId"] : "";
    const quoteAmountZar = typeof body["quoteAmountZar"] === "number" ? body["quoteAmountZar"] : undefined;
    const availability = typeof body["availability"] === "string" ? body["availability"] : undefined;
    const leadTimeDays = typeof body["leadTimeDays"] === "number" ? body["leadTimeDays"] : undefined;
    const notes = typeof body["notes"] === "string" ? body["notes"] : JSON.stringify(payload);

    return {
      supplierId: supplier.id,
      requestId,
      rawResponseText: notes,
      parsedResponseJson: body,
      ...(quoteAmountZar !== undefined ? { quoteAmountZar } : {}),
      ...(availability !== undefined ? { availability } : {}),
      ...(leadTimeDays !== undefined ? { leadTimeDays } : {}),
    };
  }
}
