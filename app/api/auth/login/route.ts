import { NextResponse } from "next/server";
import { signJwt } from "@/lib/auth-crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { credential } = body;

    if (!credential) {
      return NextResponse.json({ error: "Missing credential token" }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const jwtSecret = process.env.JWT_SECRET || "recall-app-jwt-secret-fallback";

    if (!clientId) {
      return NextResponse.json(
        { error: "GOOGLE_CLIENT_ID environment variable is not configured" },
        { status: 500 }
      );
    }

    // Verify token with Google's tokeninfo API
    const googleVerifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
      credential
    )}`;
    const res = await fetch(googleVerifyUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to verify Google credential" }, { status: 401 });
    }

    const tokenInfo = await res.json();

    const allowedEmailsStr = process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL || "";
    const allowedEmails = allowedEmailsStr.split(",").map((email) => email.trim().toLowerCase());

    // Verify token info
    if (tokenInfo.aud !== clientId) {
      return NextResponse.json({ error: "Audience mismatch / invalid client ID" }, { status: 401 });
    }

    if (!allowedEmails.includes(tokenInfo.email.toLowerCase())) {
      return NextResponse.json({ error: "Identity not authorized" }, { status: 403 });
    }

    // Sign session token (valid for 7 days)
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const sessionToken = await signJwt({ email: tokenInfo.email, exp }, jwtSecret);

    const response = NextResponse.json({ success: true });
    
    // Set HTTP-Only Session Cookie
    response.cookies.set("recall_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: unknown) {
    console.error("Auth login error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
