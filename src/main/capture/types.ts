import { EventEmitter } from "node:events";
import type { CaptureSource, SessionEvent } from "@shared/types";

export interface CaptureSession {
  sessionId: string;
  sourceId: string;
  audioPath: string;
  emitter: EventEmitter;
}

export interface CaptureAdapter {
  listSources(): Promise<CaptureSource[]>;
  startSession(sessionId: string, sourceId: string): Promise<CaptureSession>;
  stopSession(sessionId: string): Promise<{ audioPath: string }>;
  onSessionEvent(sessionId: string, listener: (event: SessionEvent) => void): () => void;
}
