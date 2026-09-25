import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";
import type { Database } from "@/types/database";
import { canAccessRoute, defaultRouteForRole, safeDestination } from "@/lib/access";

const publicRoutes = new Set(["/login", "/forgot-password", "/reset-password"]);

function isPublicPath(pathname: string) {
  return publicRoutes.has(pathname) || pathname.startsWith("/auth/");
}

export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();
  const pathname = request.nextUrl.pathname;

  if (!config) {
    if (!isPublicPath(pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const isAuthenticated = Boolean(userId);

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A valid Supabase session alone is not sufficient for FITX access. Keep the
  // browser route gate aligned with the RLS predicate used by the data layer so
  // disabled (or unprovisioned) accounts cannot continue into the app shell.
  if (isAuthenticated && !isPublicPath(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active,role")
      .eq("id", userId!)
      .maybeSingle();

    if (!profile?.is_active) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!canAccessRoute(pathname, profile.role)) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = defaultRouteForRole(profile.role);
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }
  }

  if (isAuthenticated && pathname === "/login") {
    const destination = request.nextUrl.searchParams.get("next");
    const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", userId!).maybeSingle();
    if (!profile?.is_active) return response;
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = safeDestination(destination, profile.role);
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
