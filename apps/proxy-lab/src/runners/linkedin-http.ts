import { runLinkedInHttpProbes } from "../lib/linkedin";
import { getProxyProviders } from "../lib/providers";
import { printResults, summarizeResults, writeJsonlReport } from "../lib/results";

const results = [];

for (const provider of getProxyProviders()) {
  results.push(...await runLinkedInHttpProbes(provider));
}

printResults(results);
summarizeResults(results);
writeJsonlReport(results);
