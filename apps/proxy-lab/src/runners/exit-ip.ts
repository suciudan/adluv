import { runExitIpProbe } from "../lib/exit-ip";
import { getProxyProvidersPreferWebScrapingApi } from "../lib/providers";
import { printResults, summarizeResults, writeJsonlReport } from "../lib/results";

const results = [];

for (const provider of getProxyProvidersPreferWebScrapingApi()) {
  results.push(await runExitIpProbe(provider));
}

printResults(results);
summarizeResults(results);
writeJsonlReport(results);
