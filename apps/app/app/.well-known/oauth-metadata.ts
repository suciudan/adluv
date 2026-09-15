const scopesSupported = ["openid", "profile", "email", "offline_access"];

function resolveAppOrigin() {
  const candidates = [process.env.BETTER_AUTH_URL, process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();

    if (!trimmed) {
      continue;
    }

    try {
      return new URL(trimmed).origin;
    } catch {
      continue;
    }
  }

  return "http://127.0.0.1:3000";
}

export function buildOAuthAuthorizationServerMetadata(issuerPath = "") {
  const origin = resolveAppOrigin();
  const normalizedIssuerPath = issuerPath.startsWith("/") ? issuerPath : `/${issuerPath}`;
  const issuer = issuerPath ? `${origin}${normalizedIssuerPath.replace(/\/+$/, "")}` : origin;
  const mcpBaseUrl = `${origin}/api/auth/mcp`;

  return {
    issuer,
    authorization_endpoint: `${mcpBaseUrl}/authorize`,
    token_endpoint: `${mcpBaseUrl}/token`,
    userinfo_endpoint: `${mcpBaseUrl}/userinfo`,
    jwks_uri: `${mcpBaseUrl}/jwks`,
    registration_endpoint: `${mcpBaseUrl}/register`,
    scopes_supported: scopesSupported,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    acr_values_supported: ["urn:mace:incommon:iap:silver", "urn:mace:incommon:iap:bronze"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256", "none"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: ["sub", "iss", "aud", "exp", "nbf", "iat", "jti", "email", "email_verified", "name"],
  };
}

export function oauthMetadataResponse(issuerPath?: string) {
  return Response.json(buildOAuthAuthorizationServerMetadata(issuerPath), {
    headers: {
      "cache-control": "no-store",
    },
  });
}
