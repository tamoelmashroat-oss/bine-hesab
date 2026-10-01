import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/github/return")({
  head: () => ({
    meta: [
      { title: "إتمام ربط GitHub — ناقل المستودعات" },
      {
        name: "description",
        content: "صفحة إتمام ربط حساب GitHub بعد الموافقة على الصلاحيات.",
      },
      { property: "og:title", content: "إتمام ربط GitHub" },
      { property: "og:description", content: "جارٍ إنهاء ربط حساب GitHub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("جارٍ إنهاء الربط…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    window.history.replaceState({}, document.title, window.location.pathname);

    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      payload?: { code: string; state: string },
    ) => {
      window.opener?.postMessage(
        {
          type,
          connectorId: "github",
          code: payload?.code ?? null,
          state: payload?.state ?? null,
        },
        window.location.origin,
      );
      window.close();
    };

    const error = params.get("error_description") ?? params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    if (error || !code || !state) {
      setMessage(error ?? "لم تكتمل عملية الربط.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", { code, state });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
