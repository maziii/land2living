export {
  AuthError,
  hashPassword,
  issueRefreshToken,
  revokeToken,
  validateCredentials,
  setupMfa,
  verifyMfaSetup,
  completeMfaChallenge,
  disableMfa,
  requestPasswordReset,
  resetPassword,
} from "./service.js";
export { handleAuthError, requireAuth, requireRole } from "./middleware.js";
export { authRoutes } from "./routes.js";
export type { AuthTokens, JwtPayload, Role } from "./types.js";
