"use server";

import { searchAppShell } from "@adluv/db";

import { getCurrentUser } from "../../lib/session";

export async function searchAppShellAction(query: string) {
  const user = await getCurrentUser();

  if (!user) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
      results: {
        ads: [],
        advertisers: [],
        landingPages: [],
      },
    };
  }

  try {
    const results = await searchAppShell(query);

    return {
      status: "ok" as const,
      results,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to search right now.",
      results: {
        ads: [],
        advertisers: [],
        landingPages: [],
      },
    };
  }
}
