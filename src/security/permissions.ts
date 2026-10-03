import type { Role } from "@prisma/client";
export const isAdmin = (role?: Role) =>
  role === "ADMIN" || role === "SUPER_ADMIN";
export const isSuper = (role?: Role) => role === "SUPER_ADMIN";
export function canShare(
  sensitivity: string,
  config: { resultSharing: boolean; highRiskSharing: boolean },
  confirmed: boolean,
) {
  return (
    config.resultSharing &&
    (sensitivity !== "high_risk" || config.highRiskSharing) &&
    (sensitivity === "normal" || confirmed)
  );
}
export function canOwn(
  record: { creatorId?: string | null; anonymousOwner?: string | null },
  actor: { userId?: string | null; sessionId: string },
) {
  return (
    !!(actor.userId && record.creatorId === actor.userId) ||
    !!(!record.creatorId && record.anonymousOwner === actor.sessionId)
  );
}
export function installAllowed(initialized: boolean, locked: boolean) {
  return !initialized && !locked;
}

export function resultSensitivity(current: string, version: string): string {
  const rank: Record<string, number> = {
    normal: 0,
    sensitive: 1,
    high_risk: 2,
  };
  return (rank[current] ?? 0) > (rank[version] ?? 0) ? current : version;
}
