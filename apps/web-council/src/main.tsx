import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// No-op when VITE_SENTRY_DSN is unset (local dev).
Sentry.init({
  dsn: import.meta.env["VITE_SENTRY_DSN"] || undefined,
  environment: import.meta.env.MODE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
});
import { AuthProvider } from "./context/auth.js";
import { ProtectedRoute, ResidentRoute, RoleGate } from "./components/ProtectedRoute.js";
import { AppShell } from "./components/AppShell.js";
import { PortalShell } from "./components/PortalShell.js";
import { ResidentPortalPage } from "./pages/portal/ResidentPortalPage.js";
import { ApplicationWizardPage } from "./pages/portal/ApplicationWizardPage.js";
import { ResidentApplicationDetailPage } from "./pages/portal/ResidentApplicationDetailPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { MfaChallengePage } from "./pages/MfaChallengePage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { PlaceholderPage } from "./pages/PlaceholderPage.js";
import { ResidentsPage } from "./pages/residents/ResidentsPage.js";
import { ResidentDetailPage } from "./pages/residents/ResidentDetailPage.js";
import { StandsPage } from "./pages/stands/StandsPage.js";
import { StandDetailPage } from "./pages/stands/StandDetailPage.js";
import { CreateStandPage } from "./pages/stands/CreateStandPage.js";
import { ApplicationsPage } from "./pages/applications/ApplicationsPage.js";
import { ApplicationDetailPage } from "./pages/applications/ApplicationDetailPage.js";
import { LandDashboardPage } from "./pages/land/LandDashboardPage.js";
import { AllocatedLandPage } from "./pages/land/AllocatedLandPage.js";
import { PTOsPage } from "./pages/land/PTOsPage.js";
import { PTODetailPage } from "./pages/land/PTODetailPage.js";
import { ConfigurationsPage } from "./pages/land/ConfigurationsPage.js";
import { ResalesPage } from "./pages/resales/ResalesPage.js";
import { ResaleDetailPage } from "./pages/resales/ResaleDetailPage.js";
import { HouseSalesPage } from "./pages/marketplace/HouseSalesPage.js";
import { ServicesPage } from "./pages/services/ServicesPage.js";
import { SuppliersPage } from "./pages/suppliers/SuppliersPage.js";
import { SupplierQuoteDetailPage } from "./pages/suppliers/SupplierQuoteDetailPage.js";
import { CommissionPage } from "./pages/suppliers/CommissionPage.js";
import "./index.css";

const COUNCIL_ALL   = ["founder", "council_secretary", "council_member", "foot_soldier"];
const COUNCIL_STAFF = ["founder", "council_secretary", "council_member"];
const SENIOR_STAFF  = ["founder", "council_secretary"];
const LAND_TEAM     = ["founder", "council_secretary", "council_member", "land_officer"];
const LAND_ALL      = ["founder", "council_secretary", "council_member", "land_officer", "foot_soldier"];

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/mfa-challenge" element={<MfaChallengePage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />

            {/* ── Land Administration ───────────────────────────────────── */}
            <Route path="land">
              <Route path="overview" element={<RoleGate roles={LAND_TEAM}><LandDashboardPage /></RoleGate>} />

              {/* Residents */}
              <Route path="residents" element={<RoleGate roles={COUNCIL_ALL}><ResidentsPage /></RoleGate>} />
              <Route path="residents/:id" element={<RoleGate roles={COUNCIL_ALL}><ResidentDetailPage /></RoleGate>} />

              {/* Available land / stand inventory */}
              <Route path="available" element={<RoleGate roles={LAND_ALL}><StandsPage /></RoleGate>} />
              <Route path="available/new" element={<RoleGate roles={["founder", "council_secretary", "land_officer", "foot_soldier"]}><CreateStandPage /></RoleGate>} />
              <Route path="available/:id" element={<RoleGate roles={LAND_ALL}><StandDetailPage /></RoleGate>} />

              {/* Applications */}
              <Route path="applications" element={<RoleGate roles={LAND_TEAM}><ApplicationsPage /></RoleGate>} />
              <Route path="applications/:id" element={<RoleGate roles={LAND_TEAM}><ApplicationDetailPage /></RoleGate>} />

              {/* Allocated */}
              <Route path="allocated" element={<RoleGate roles={COUNCIL_STAFF}><AllocatedLandPage /></RoleGate>} />

              {/* PTO Register */}
              <Route path="ptos" element={<RoleGate roles={LAND_TEAM}><PTOsPage /></RoleGate>} />
              <Route path="ptos/:id" element={<RoleGate roles={LAND_TEAM}><PTODetailPage /></RoleGate>} />

              {/* Configurations */}
              <Route path="configurations" element={<RoleGate roles={SENIOR_STAFF}><ConfigurationsPage /></RoleGate>} />
            </Route>

            {/* ── Marketplace ───────────────────────────────────────────── */}
            <Route path="marketplace">
              <Route path="resales" element={<RoleGate roles={COUNCIL_STAFF}><ResalesPage /></RoleGate>} />
              <Route path="resales/:id" element={<RoleGate roles={COUNCIL_STAFF}><ResaleDetailPage /></RoleGate>} />
              <Route path="house-sales" element={<RoleGate roles={SENIOR_STAFF}><HouseSalesPage /></RoleGate>} />
              <Route path="services" element={<RoleGate roles={SENIOR_STAFF}><ServicesPage /></RoleGate>} />
              <Route path="suppliers" element={<RoleGate roles={SENIOR_STAFF}><SuppliersPage /></RoleGate>} />
              <Route path="suppliers/sales" element={<RoleGate roles={SENIOR_STAFF}><CommissionPage /></RoleGate>} />
              <Route path="suppliers/:id" element={<RoleGate roles={SENIOR_STAFF}><SupplierQuoteDetailPage /></RoleGate>} />
            </Route>

            {/* ── Flat ──────────────────────────────────────────────────── */}
            <Route path="audit" element={<RoleGate roles={SENIOR_STAFF}><PlaceholderPage /></RoleGate>} />
          </Route>
          {/* ── Resident portal ───────────────────────────────────────────── */}
          <Route
            path="/portal"
            element={
              <ResidentRoute>
                <PortalShell />
              </ResidentRoute>
            }
          >
            <Route index element={<ResidentPortalPage />} />
            <Route path="apply/:id" element={<ApplicationWizardPage />} />
            <Route path="applications/:id" element={<ResidentApplicationDetailPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
