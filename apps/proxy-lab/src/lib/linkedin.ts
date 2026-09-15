import { envString } from "./env";
import { requestText } from "./http-client";
import type { ProxyProvider } from "./providers";
import { runProbe, type ProbeResult } from "./results";

function linkedInCompanyUrl() {
  const explicitUrl = envString("PROXY_LAB_LINKEDIN_URL");

  if (explicitUrl) {
    return explicitUrl;
  }

  const slug = envString("PROXY_LAB_LINKEDIN_COMPANY", "openai").replace(/^company\//, "").replace(/^\/+|\/+$/g, "");

  return `https://www.linkedin.com/company/${slug}/`;
}

export async function runLinkedInHttpProbes(provider: ProxyProvider): Promise<ProbeResult[]> {
  const url = linkedInCompanyUrl();

  return [
    await runProbe(provider, "linkedin.http.company_page", async () => {
      const response = await requestText(provider, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0",
        },
        url,
      });
      const hasProfileMarkers = response.body.includes("linkedin.com/company/") || response.body.includes("Organization");

      return {
        detail: `url=${url} body_bytes=${response.body.length} markers=${hasProfileMarkers ? "yes" : "no"}`,
        ok: response.ok && hasProfileMarkers,
        status: response.status,
      };
    }),
  ];
}
