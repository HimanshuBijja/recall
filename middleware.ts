import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwt } from "./lib/auth-crypto";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypass routes that don't require authentication
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const jwtSecret = process.env.JWT_SECRET || "recall-app-jwt-secret-fallback";
  const apiKeySecret = process.env.RECALL_API_KEY;

  // Check X-API-Key header for API routes
  if (pathname.startsWith("/api/")) {
    const headerApiKey = request.headers.get("x-api-key");
    if (apiKeySecret && headerApiKey === apiKeySecret) {
      return NextResponse.next();
    }
  }

  // Check session cookie
  const sessionCookie = request.cookies.get("recall_session")?.value;
  if (sessionCookie) {
    const payload = await verifyJwt(sessionCookie, jwtSecret);
    if (payload && payload.email) {
      return NextResponse.next();
    }
  }

  // If unauthorized API request, return 401
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  // Otherwise, redirect to login page
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
