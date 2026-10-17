import { lazy, Suspense, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { signOut, type AuthenticatedUser } from "@/features/auth/api/auth";
import { LoginPage } from "@/features/auth/pages/login-page";

const HomePage = lazy(() =>
  import("@/pages/home-page").then((module) => ({ default: module.HomePage })),
);
const WarehousePage = lazy(() =>
  import("@/pages/warehouse-page").then((module) => ({ default: module.WarehousePage })),
);

export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  const handleLogout = async () => {
    await signOut();
    setUser(null);
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onAuthenticated={setUser} />
          )
        }
      />
      <Route
        path="/"
        element={
          user ? (
            <Suspense fallback={<main aria-busy="true" className="fixed inset-0 bg-[#eef0f2]" />}>
              <HomePage user={user} onLogout={handleLogout} />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/warehouses/:warehouseId"
        element={
          user ? (
            <Suspense fallback={<main aria-busy="true" className="fixed inset-0 bg-[#f1f5f9]" />}>
              <WarehousePage />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}
