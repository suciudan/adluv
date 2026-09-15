import { requestText } from "./http-client";
import { envString } from "./env";
import type { ProxyProvider } from "./providers";
import { runProbe, type ProbeResult } from "./results";

type IpifyResponse = {
  ip?: string;
};

export async function runExitIpProbe(provider: ProxyProvider): Promise<ProbeResult> {
  return runProbe(provider, "http.exit_ip", async () => {
    const url = envString("PROXY_LAB_IP_URL", "http://api.ipify.org?format=json");
    let lastResult: { body: string; ip: string; status: number; ok: boolean } | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await requestText(provider, {
        headers: {
          accept: "application/json",
          "user-agent": "AdluvProxyLab/1.0",
        },
        url,
      });
      let ip = "";

      try {
        ip = (JSON.parse(response.body) as IpifyResponse).ip ?? "";
      } catch {
        ip = response.body.replace(/\s+/g, "");
      }

      lastResult = {
        body: response.body,
        ip,
        ok: response.ok && /^[a-f0-9:.]+$/i.test(ip),
        status: response.status,
      };

      if (lastResult.ok || !response.body.includes("something went wrong")) {
        break;
      }
    }

    if (!lastResult) {
      throw new Error("Exit IP request did not run.");
    }

    const bodyPreview = lastResult.body.replace(/\s+/g, " ").trim().slice(0, 120).replace(/"/g, "'");

    return {
      detail: lastResult.ok
        ? `exit_ip=${lastResult.ip}`
        : `body_bytes=${lastResult.body.length}${bodyPreview ? ` body="${bodyPreview}"` : ""}`,
      ok: lastResult.ok,
      status: lastResult.status,
    };
  });
}
