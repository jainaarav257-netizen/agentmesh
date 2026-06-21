import type { Message } from '../types/index.js';

interface Session {
  messages: Message[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class SessionMemory {
  private sessions = new Map<string, Session>();
  private readonly ttlMs: number;

  constructor(ttlMs = 30 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  getOrCreate(sessionId: string): Session {
    this.evictExpired();
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return this.sessions.get(sessionId)!;
  }

  append(sessionId: string, message: Message): void {
    const session = this.getOrCreate(sessionId);
    session.messages.push(message);
    session.updatedAt = Date.now();
  }

  getMessages(sessionId: string): Message[] {
    return this.getOrCreate(sessionId).messages;
  }

  setMeta(sessionId: string, key: string, value: unknown): void {
    this.getOrCreate(sessionId).metadata[key] = value;
  }

  getMeta(sessionId: string, key: string): unknown {
    return this.getOrCreate(sessionId).metadata[key];
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt > this.ttlMs) this.sessions.delete(id);
    }
  }
}
