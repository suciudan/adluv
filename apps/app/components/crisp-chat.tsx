"use client";

import { useEffect } from "react";
import Script from "next/script";

import { defaultAppTheme, normalizeAppTheme, type AppTheme } from "../lib/theme";

type CrispCallback = (...args: unknown[]) => void;
type CrispCommand = [string, string] | [string, string, unknown[] | CrispCallback];

declare global {
  interface Window {
    $crisp?: Array<CrispCommand>;
    CRISP_WEBSITE_ID?: string;
  }
}

function getCurrentThemeMode(): AppTheme {
  if (typeof document === "undefined") {
    return defaultAppTheme;
  }

  return normalizeAppTheme(document.documentElement.dataset.theme);
}

function pushCrispCommand(command: CrispCommand) {
  window.$crisp = window.$crisp ?? [];
  window.$crisp.push(command);
}

export function hideCrispChat() {
  if (typeof window === "undefined") {
    return;
  }

  pushCrispCommand(["do", "chat:hide"]);
}

export function openCrispChat() {
  if (typeof window === "undefined") {
    return;
  }

  pushCrispCommand(["do", "chat:show"]);
  pushCrispCommand(["do", "chat:open"]);
}

export function CrispChat({
  websiteId,
  user,
  workspace,
}: {
  websiteId: string;
  user: {
    email: string;
    emailSignature: string | null;
    name: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    role: string;
  };
}) {
  useEffect(() => {
    window.$crisp = window.$crisp ?? [];
    window.CRISP_WEBSITE_ID = websiteId;

    pushCrispCommand(["set", "user:email", user.emailSignature ? [user.email, user.emailSignature] : [user.email]]);
    pushCrispCommand(["set", "user:nickname", [user.name]]);
    pushCrispCommand([
      "set",
      "session:data",
      [
        [
          ["workspace_id", workspace.id],
          ["workspace_name", workspace.name],
          ["workspace_slug", workspace.slug],
          ["workspace_role", workspace.role],
        ],
      ],
    ]);

    const syncCrispTheme = () => {
      pushCrispCommand(["config", "color:mode", [getCurrentThemeMode()]]);
    };

    syncCrispTheme();
    hideCrispChat();

    const hideClosedChat = () => hideCrispChat();

    pushCrispCommand(["on", "chat:closed", hideClosedChat]);

    const observer = new MutationObserver(syncCrispTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      observer.disconnect();
      pushCrispCommand(["off", "chat:closed"]);
    };
  }, [user.email, user.emailSignature, user.name, websiteId, workspace.id, workspace.name, workspace.role, workspace.slug]);

  return <Script id="crisp-chat-loader" src="https://client.crisp.chat/l.js" strategy="afterInteractive" />;
}
