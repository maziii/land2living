import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

type Role = "founder" | "council_secretary" | "council_member" | "foot_soldier" | "land_officer" | "resident";

export function DashboardPage() {
  const { auth } = useAuth();
  const role = auth?.claims.role as Role | undefined;

  if (role === "resident")    return <Navigate to="/portal" replace />;
  if (role === "foot_soldier") return <Navigate to="/dashboard/land/residents" replace />;
  if (role === "land_officer") return <Navigate to="/dashboard/land/applications" replace />;

  return <Navigate to="/dashboard/land/overview" replace />;
}
