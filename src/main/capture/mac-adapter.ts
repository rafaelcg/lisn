import { EventEmitter } from "node:events";
import type { SessionEvent } from "@shared/types";
import type { CaptureAdapter, CaptureSession } from "./types";
import { MacHelperClient } from "./mac-helper-client";

export class MacCaptureAdapter implements CaptureAdapter {
  private readonly sessions = new Map<string, CaptureSession>();
  private readonly helperClient = new MacHelperClient();

  async listSources() {
    const sources = await this.helperClient.listSources();
    console.log("[Lissen mac adapter] listed sources", sources.length);
    return sources;
  }

  async startSession(sessionId: string, sourceId: string): Promise<CaptureSession> {
    const emitter = new EventEmitter();
    const payload = await this.helperClient.startSession(sessionId, sourceId);
    const session: CaptureSession = {
      sessionId,
      sourceId,
      audioPath: payload.audioPath,
      emitter
    };
    this.sessions.set(sessionId, session);
    this.helperClient.onSessionEvent(sessionId, (event) => emitter.emit("event", event));
    return session;
  }

  async stopSession(sessionId: string): Promise<{ audioPath: string }> {
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`No active capture session for ${sessionId}`);
    }

    this.sessions.delete(sessionId);
    return this.helperClient.stopSession(sessionId);
  }

  onSessionEvent(sessionId: string, listener: (event: SessionEvent) => void) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return () => undefined;
    }

    const wrapped = (event: SessionEvent) => listener(event);
    session.emitter.on("event", wrapped);
    return () => session.emitter.off("event", wrapped);
  }
}
