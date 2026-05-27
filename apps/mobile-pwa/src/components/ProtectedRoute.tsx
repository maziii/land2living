import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

interface Props {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { auth } = useAuth();

  if (!auth) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(auth.role)) {
    return <Navigate to={auth.role === "resident" ? "/resident" : "/"} replace />;
  }

  return <>{children}</>;
}
