import { runExitIpProbe } from "../lib/exit-ip";
import { getWebScrapingApiProxyProvider } from "../lib/providers";
import { printResults, summarizeResults, writeJsonlReport } from "../lib/results";

const results = [
  await runExitIpProbe(getWebScrapingApiProxyProvider()),
];

printResults(results);
summarizeResults(results);
writeJsonlReport(results);
