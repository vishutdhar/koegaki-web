import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";

// The Mac app's Buy buttons open koegaki.com/buy (a stable URL we control), so the checkout
// provider or link can change without shipping an app update. Until the real Lemon Squeezy
// checkout URL is configured (NEXT_PUBLIC_CHECKOUT_URL), fall back to the home page rather
// than a dead placeholder link.
export function GET(request: Request) {
  const target = SITE.checkoutUrl.includes("PLACEHOLDER")
    ? new URL("/", request.url)
    : SITE.checkoutUrl;
  return NextResponse.redirect(target, 307);
}
