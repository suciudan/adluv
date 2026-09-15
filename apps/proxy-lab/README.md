# Proxy Lab

Small runners for comparing proxy providers against the same public APIs used by ad backfill and enrichment.

## Run

```bash
yarn proxy-lab:smoke
yarn proxy-lab:ip
yarn proxy-lab:ip:webshare
yarn proxy-lab:ip:webscrapingapi
yarn proxy-lab:google-rpc-429
yarn proxy-lab:google-rpc-check
yarn proxy-lab:google-rpc-webshare-check
yarn proxy-lab:google
yarn proxy-lab:meta
yarn proxy-lab:linkedin
yarn proxy-lab
```

Each runner prints `PASS` or `FAIL` per provider and target. Set `PROXY_LAB_OUTPUT=.tmp/proxy-lab/results.jsonl` to append machine-readable results.

The IP runner defaults to `http://api.ipify.org?format=json` because some proxy providers handle plain HTTP but fail HTTPS CONNECT. Override with `PROXY_LAB_IP_URL=https://api.ipify.org?format=json` when testing HTTPS proxy tunneling specifically.

When `WEBSCRAPINGAPI_PROXY_URL` is configured and no `PROXY_LAB_PROVIDER(S)` override is set, `yarn proxy-lab:ip` checks the WebScrapingAPI proxy by default. Set `PROXY_LAB_PROVIDER=direct` to force a direct host-IP check.

The focused Google RPC runners use the same default: with `WEBSCRAPINGAPI_PROXY_URL` configured, `yarn proxy-lab:google-rpc-429` and `yarn proxy-lab:google` run through the WebScrapingAPI proxy unless `PROXY_LAB_PROVIDER(S)` is set.

Use `yarn proxy-lab:google-rpc-check` to print the selected provider's exit IP immediately before the Google RPC request.

Use `PROXY_LAB_PROVIDER=webshare` or `yarn proxy-lab:ip:webshare` to expand a Webshare credential file into one provider per line. No credential file is supplied. Create your own private file, set its path with `PROXY_LAB_PROXY_FILE`, and keep it outside version control.

Use `yarn proxy-lab:google-rpc-webshare-check` to run exit-IP plus the failing Google RPC request for every Webshare proxy.

For production app-local env files, set `PROXIES_LIST` to either the Webshare proxy-list download URL or one proxy per line. Source-specific overrides still work: `GOOGLE_RPC_PROXY_LIST`, `META_PROXY_LIST`, or `GOOGLE_RPC_PROXY_FILE` relative to `ADLUV_ENV_DIR`, the app working directory, or the repo root.

## Providers

Switch providers from env only:

```bash
PROXY_LAB_PROVIDERS=direct,webscrapingapi-rest,my-proxy

PROXY_PROVIDER_WEBSCRAPINGAPI_REST_MODE=webscrapingapi-rest
PROXY_PROVIDER_WEBSCRAPINGAPI_REST_API_KEY=...

PROXY_PROVIDER_MY_PROXY_MODE=http-proxy
PROXY_PROVIDER_MY_PROXY_URL=http://host:port
PROXY_PROVIDER_MY_PROXY_USERNAME=...
PROXY_PROVIDER_MY_PROXY_PASSWORD=...
```

Proxy files support these formats:

- `host:port:username:password`
- `username:password@host:port`
- `http://username:password@host:port`

Supported modes:

- `direct`: no proxy.
- `http-proxy`: generic HTTP or HTTPS proxy.
- `webscrapingapi-proxy`: WebScrapingAPI proxy endpoint with username, password, and country formatting.
- `webscrapingapi-rest`: WebScrapingAPI REST endpoint.

The `webscrapingapi-*` provider names also fall back to the existing `WEBSCRAPINGAPI_*` env vars.

For WebScrapingAPI proxy providers, `session=` is only added when `PROXY_PROVIDER_<NAME>_SESSION_ID` is set. The default omits sticky sessions because WSA can fail HTTPS CONNECT for some targets when a session is attached.

## Targets

- `http.exit_ip`: confirms which exit IP the provider uses.
- `google.rpc.search_suggestions`: Google Ads Transparency RPC search.
- `google.rpc.search_creatives`: Google Ads Transparency RPC creative search when `PROXY_LAB_GOOGLE_ADVERTISER_ID` is set.
- `google.http.preview`: Google creative preview HTTP when `PROXY_LAB_GOOGLE_PREVIEW_URL` is set.
- `meta.graphql.search`: Meta Ads Library session bootstrap plus GraphQL search.
- `linkedin.http.company_page`: LinkedIn public company page fetch.
