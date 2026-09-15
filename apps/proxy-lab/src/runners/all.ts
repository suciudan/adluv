import { runExitIpProbe } from "../lib/exit-ip";
import { runGoogleRpcProbes } from "../lib/google";
import { runLinkedInHttpProbes } from "../lib/linkedin";
import { runMetaGraphqlProbes } from "../lib/meta";
import { getProxyProviders } from "../lib/providers";
import { printResults, summarizeResults, writeJsonlReport } from "../lib/results";

const results = [];

for (const provider of getProxyProviders()) {
  results.push(await runExitIpProbe(provider));
  results.push(...await runGoogleRpcProbes(provider));
  results.push(...await runMetaGraphqlProbes(provider));
  results.push(...await runLinkedInHttpProbes(provider));
}

printResults(results);
summarizeResults(results);
writeJsonlReport(results);
