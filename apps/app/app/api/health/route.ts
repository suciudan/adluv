import { NextResponse } from "next/server";

import { getWebRuntimeStatus } from "../../../lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "app",
    flags: await getWebRuntimeStatus(),
  });
}
