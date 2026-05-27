// Standard event type strings — use these constants rather than bare strings so
// typos are caught at compile time. Modules may define their own event types
// alongside these; the DB column is a plain text field.
export const AuditEventType = {
  // Auth
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  USER_LOGIN_FAILED: "user.login_failed",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_MFA_ENABLED: "user.mfa_enabled",
  USER_MFA_DISABLED: "user.mfa_disabled",

  // Generic data lifecycle (modules use more specific types where useful)
  RECORD_CREATED: "record.created",
  RECORD_UPDATED: "record.updated",
  RECORD_SOFT_DELETED: "record.soft_deleted",

  // PII access (POPIA: every admin read of personal data must be logged)
  PII_ACCESSED: "pii.accessed",

  // Bulk operations
  BULK_IMPORT: "bulk.import",
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

export interface AuditEventInput {
  actorUserId?: string;
  actorRole?: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  payloadJson?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
