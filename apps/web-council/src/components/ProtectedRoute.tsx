import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

const COUNCIL_ROLES = ["founder", "council_secretary", "council_member", "foot_soldier", "land_officer"];

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.claims.role === "resident") return <Navigate to="/portal" replace />;
  if (!COUNCIL_ROLES.includes(auth.claims.role)) {
    return <Navigate to="/login" replace state={{ error: "This app is for council staff only." }} />;
  }
  return <>{children}</>;
}

export function ResidentRoute({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.claims.role !== "resident") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Redirects to /dashboard if the current user's role is not in the allowed list. */
export function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { auth } = useAuth();
  if (!auth || !roles.includes(auth.claims.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
