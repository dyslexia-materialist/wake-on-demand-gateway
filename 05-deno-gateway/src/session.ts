import { createSessionToken } from "./auth.ts";

export interface SessionData {
  token: string;
  createdAt: number;
  expiresAt: number;
  userId: string;
}

const SESSION_TTL_MS = 10 * 60 * 1000;

const sessions = new Map<string, SessionData>();

function removeExpiredSessions(): void {
  const now = Date.now();

  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

export function createSession(userId: string): SessionData {
  removeExpiredSessions();

  const now = Date.now();
  const token = createSessionToken();

  const session: SessionData = {
    token,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    userId,
  };

  sessions.set(token, session);

  return session;
}

export function getSession(token: string): SessionData | null {
  removeExpiredSessions();

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

export function validateSession(token: string): boolean {
  return getSession(token) !== null;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_MS / 1000;
}

export function clearAllSessions(): void {
  sessions.clear();
}
