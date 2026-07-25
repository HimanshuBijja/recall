import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const loginUrl = new URL("/login", url.origin);
  
  const response = NextResponse.redirect(loginUrl);
  
  // Clear the recall_session cookie by setting maxAge to 0
  response.cookies.set("recall_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
