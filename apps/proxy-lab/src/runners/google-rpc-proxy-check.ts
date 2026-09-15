import { runExitIpProbe } from "../lib/exit-ip";
import { runGoogleRpcSearchSuggestionsProbe } from "../lib/google";
import { getProxyProvidersPreferWebScrapingApi } from "../lib/providers";
import { printResults, summarizeResults, writeJsonlReport } from "../lib/results";

const results = [];

for (const provider of getProxyProvidersPreferWebScrapingApi()) {
  results.push(await runExitIpProbe(provider));
  results.push(await runGoogleRpcSearchSuggestionsProbe(provider));
}

printResults(results);
summarizeResults(results);
writeJsonlReport(results);
