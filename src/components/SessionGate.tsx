import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { getSessionStatus } from "@/lib/auth.functions";
import { PageLoading } from "./PageLoading";

export function SessionGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function checkSession() {
      const session = await getSessionStatus({ signal: controller.signal }).catch(() => null);
      if (controller.signal.aborted) return;

      if (session?.authenticated) {
        setAuthenticated(true);
      } else {
        void navigate({ to: "/login", replace: true });
      }
    }
    void checkSession();
    return () => controller.abort();
  }, [navigate]);

  return authenticated ? children : <PageLoading message="লগইন যাচাই হচ্ছে…" />;
}
