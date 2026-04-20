export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorType: string;
  actorUsername: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  oldValues: unknown | null;
  newValues: unknown | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditListResponse {
  items: AuditEntry[];
  nextCursor: string | null;
}
