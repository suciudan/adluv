import { runMetaGraphqlProbes } from "../lib/meta";
import { getProxyProviders } from "../lib/providers";
import { printResults, summarizeResults, writeJsonlReport } from "../lib/results";

const results = [];

for (const provider of getProxyProviders()) {
  results.push(...await runMetaGraphqlProbes(provider));
}

printResults(results);
summarizeResults(results);
writeJsonlReport(results);
