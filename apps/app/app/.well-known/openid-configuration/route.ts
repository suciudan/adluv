import { oauthMetadataResponse } from "../oauth-metadata";

export const dynamic = "force-dynamic";

export function GET() {
  return oauthMetadataResponse();
}
