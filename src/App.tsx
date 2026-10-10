import { useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "@/features/auth/pages/login-page";
import type { DemoUser } from "@/features/auth/services/auth-service";
import { HomePage } from "@/pages/home-page";

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
            <HomePage user={demoUser} onLogout={() => setDemoUser(null)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={demoUser ? "/" : "/login"} replace />} />
    </Routes>
  );
}
