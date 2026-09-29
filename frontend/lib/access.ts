import type { UserRole } from "@/types/api";

export type AccessRole = UserRole | "owner" | "admin" | "manager" | "receptionist" | "ladies_receptionist";

const removedRoutes = ["/plans", "/equipment"];

const restrictedRoutes: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/dashboard", roles: ["OWNER", "ADMIN", "MANAGER", "LADIES_RECEPTIONIST"] },
  { prefix: "/expenses", roles: ["OWNER", "ADMIN", "MANAGER", "RECEPTIONIST"] },
  { prefix: "/reports", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { prefix: "/staff", roles: ["OWNER"] },
  { prefix: "/settings", roles: ["OWNER"] },
];

export function normalizeRole(role: AccessRole): UserRole {
  if (role === "owner" || role === "OWNER") return "OWNER";
  if (role === "admin" || role === "ADMIN") return "ADMIN";
  if (role === "manager" || role === "MANAGER") return "MANAGER";
  if (role === "ladies_receptionist" || role === "LADIES_RECEPTIONIST") return "LADIES_RECEPTIONIST";
  return "RECEPTIONIST";
}

export function isReceptionStaff(role: AccessRole) {
  const normalized = normalizeRole(role);
  return normalized === "RECEPTIONIST" || normalized === "LADIES_RECEPTIONIST";
}

export function isReceptionist(role: AccessRole) {
  return normalizeRole(role) === "RECEPTIONIST";
}

export function isLadiesReceptionist(role: AccessRole) {
  return normalizeRole(role) === "LADIES_RECEPTIONIST";
}

export function canAccessExpenses(role: AccessRole) {
  return ["OWNER", "ADMIN", "MANAGER", "RECEPTIONIST"].includes(normalizeRole(role));
}

export function canManageMember(role: AccessRole, memberSection?: "gents" | "ladies") {
  return !isLadiesReceptionist(role) || memberSection === "ladies";
}

export function roleLabel(role: AccessRole) {
  return normalizeRole(role) === "LADIES_RECEPTIONIST"
    ? "Ladies Receptionist"
    : normalizeRole(role).slice(0, 1) + normalizeRole(role).slice(1).toLowerCase();
}

export function defaultRouteForRole(role: AccessRole) {
  return isReceptionist(role) ? "/members" : "/dashboard";
}

export function canAccessRoute(pathname: string, role: AccessRole) {
  if (removedRoutes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  const rule = restrictedRoutes.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !rule || rule.roles.includes(normalizeRole(role));
}

export function safeDestination(destination: string | null, role: AccessRole) {
  if (!destination?.startsWith("/") || destination.startsWith("//") || !canAccessRoute(destination, role)) {
    return defaultRouteForRole(role);
  }
  return destination;
}
