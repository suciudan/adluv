import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const workspaceMatch = url.pathname.match(/^\/w\/([^/]+)(\/.*)?$/);

  if (workspaceMatch) {
    const workspaceSlug = decodeURIComponent(workspaceMatch[1] ?? "").trim();
    const routePath = workspaceMatch[2] || "/ads";
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = routePath;

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set("adluv_workspace_slug", workspaceSlug, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
