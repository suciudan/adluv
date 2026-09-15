import { runGoogleRpcProbes } from "../lib/google";
import { getProxyProvidersPreferWebScrapingApi } from "../lib/providers";
import { printResults, summarizeResults, writeJsonlReport } from "../lib/results";

const results = [];

for (const provider of getProxyProvidersPreferWebScrapingApi()) {
  results.push(...await runGoogleRpcProbes(provider));
}

printResults(results);
summarizeResults(results);
writeJsonlReport(results);
