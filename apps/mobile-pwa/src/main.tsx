import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/auth.js";
import { SyncProvider } from "./context/sync.js";
import ProtectedRoute from "./components/ProtectedRoute.js";

// Field (foot soldier) pages
import LoginPage from "./pages/LoginPage.js";
import HomePage from "./pages/HomePage.js";
import RegisterResidentPage from "./pages/RegisterResidentPage.js";
import RegisterStandPage from "./pages/RegisterStandPage.js";
import LinkOccupancyPage from "./pages/LinkOccupancyPage.js";
import SubmitApplicationPage from "./pages/SubmitApplicationPage.js";
import BrowseListingsPage from "./pages/BrowseListingsPage.js";
import CreateListingPage from "./pages/CreateListingPage.js";
import ResaleDetailPage from "./pages/ResaleDetailPage.js";

// Resident pages
import ResidentShell from "./pages/resident/ResidentShell.js";
import OverviewPage from "./pages/resident/OverviewPage.js";
import MyLandPage from "./pages/resident/MyLandPage.js";
import MarketplacePage from "./pages/resident/MarketplacePage.js";
import ServicesPage from "./pages/resident/ServicesPage.js";
import ProviderProfilePage from "./pages/resident/ProviderProfilePage.js";
import LandApplicationWizard from "./pages/resident/LandApplicationWizard.js";
import ApplicationDetailPage from "./pages/resident/ApplicationDetailPage.js";

import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SyncProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* ── Resident portal ─────────────────────────────────────── */}
            <Route
              path="/resident"
              element={
                <ProtectedRoute allowedRoles={["resident"]}>
                  <ResidentShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="land"       element={<MyLandPage />} />
              <Route path="apply"              element={<LandApplicationWizard />} />
              <Route path="apply/:id"         element={<LandApplicationWizard />} />
              <Route path="application/:id"   element={<ApplicationDetailPage />} />
              <Route path="market"     element={<MarketplacePage />} />
              <Route path="services"   element={<ServicesPage />} />
              <Route path="provider/:id" element={<ProviderProfilePage />} />
            </Route>

            {/* Resale detail accessible from the resident portal */}
            <Route
              path="/resale/:id"
              element={
                <ProtectedRoute allowedRoles={["resident", "foot_soldier", "council_secretary", "council_member", "founder"]}>
                  <ResaleDetailPage />
                </ProtectedRoute>
              }
            />

            {/* ── Field portal (foot soldier + council staff) ──────────── */}
            <Route
              path="/"
              element={
                <ProtectedRoute allowedRoles={["foot_soldier", "council_secretary", "council_member", "founder"]}>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/register-resident"
              element={
                <ProtectedRoute allowedRoles={["foot_soldier", "council_secretary", "founder"]}>
                  <RegisterResidentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/register-stand"
              element={
                <ProtectedRoute allowedRoles={["foot_soldier", "council_secretary", "founder"]}>
                  <RegisterStandPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/link-occupancy"
              element={
                <ProtectedRoute allowedRoles={["foot_soldier", "council_secretary", "founder"]}>
                  <LinkOccupancyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/submit-application"
              element={
                <ProtectedRoute allowedRoles={["foot_soldier", "council_secretary", "founder"]}>
                  <SubmitApplicationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/browse-listings"
              element={
                <ProtectedRoute allowedRoles={["foot_soldier", "council_secretary", "council_member", "founder"]}>
                  <BrowseListingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-listing"
              element={
                <ProtectedRoute allowedRoles={["foot_soldier", "council_secretary", "founder"]}>
                  <CreateListingPage />
                </ProtectedRoute>
              }
            />

            {/* Role-based default redirect */}
            <Route path="*" element={<RoleRedirect />} />
          </Routes>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

function RoleRedirect() {
  // Rendered when no route matches — redirect to the correct home for this role.
  // AuthProvider stores auth in localStorage; read it directly to avoid a hook.
  try {
    const raw = localStorage.getItem("l2l_field_auth");
    if (raw) {
      const { access } = JSON.parse(raw) as { access: string };
      const payload = JSON.parse(atob(access.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
      const role = (payload as { role?: string }).role;
      if (role === "resident") return <Navigate to="/resident" replace />;
    }
  } catch { /* fall through */ }
  return <Navigate to="/" replace />;
}
