import { lazy, Suspense, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "@/features/auth/pages/login-page";
import type { DemoUser } from "@/features/auth/services/auth-service";

const HomePage = lazy(() =>
  import("@/pages/home-page").then((module) => ({ default: module.HomePage })),
);
const WarehousePage = lazy(() =>
  import("@/pages/warehouse-page").then((module) => ({ default: module.WarehousePage })),
);

export default function App() {
  const [demoUser, setDemoUser] = useState<DemoUser | null>(null);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          demoUser ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onAuthenticated={setDemoUser} />
          )
        }
      />
      <Route
        path="/"
        element={
          demoUser ? (
            <Suspense fallback={<main aria-busy="true" className="fixed inset-0 bg-[#eef0f2]" />}>
              <HomePage user={demoUser} onLogout={() => setDemoUser(null)} />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/warehouses/:warehouseId"
        element={
          demoUser ? (
            <Suspense fallback={<main aria-busy="true" className="fixed inset-0 bg-[#f1f5f9]" />}>
              <WarehousePage />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={demoUser ? "/" : "/login"} replace />} />
    </Routes>
  );
}
