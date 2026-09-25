import type { UserRole } from "@/types/api";

export type AccessRole = UserRole | "owner" | "admin" | "manager" | "receptionist";

const restrictedRoutes: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/dashboard", roles: ["OWNER", "ADMIN"] },
  { prefix: "/expenses", roles: ["OWNER", "ADMIN"] },
  { prefix: "/reports", roles: ["OWNER", "ADMIN"] },
  { prefix: "/staff", roles: ["OWNER"] },
  { prefix: "/settings", roles: ["OWNER"] },
];

export function normalizeRole(role: AccessRole): UserRole {
  if (role === "owner" || role === "OWNER") return "OWNER";
  if (role === "admin" || role === "ADMIN") return "ADMIN";
  return "STAFF";
}

export function defaultRouteForRole(role: AccessRole) {
  return normalizeRole(role) === "STAFF" ? "/members" : "/dashboard";
}

export function canAccessRoute(pathname: string, role: AccessRole) {
  const rule = restrictedRoutes.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !rule || rule.roles.includes(normalizeRole(role));
}

export function safeDestination(destination: string | null, role: AccessRole) {
  if (!destination?.startsWith("/") || destination.startsWith("//") || !canAccessRoute(destination, role)) {
    return defaultRouteForRole(role);
  }
  return destination;
}
