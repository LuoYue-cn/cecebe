import { NextResponse, type NextRequest } from "next/server";
export function middleware(req: NextRequest) {
  const response = NextResponse.next();
  if (
    req.nextUrl.pathname.startsWith("/result") ||
    req.nextUrl.pathname.startsWith("/admin") ||
    req.nextUrl.pathname.startsWith("/me") ||
    req.nextUrl.pathname.startsWith("/s/")
  )
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
