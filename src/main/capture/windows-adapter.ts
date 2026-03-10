import type { CaptureAdapter, CaptureSession } from "./types";
import type { CaptureSource, SessionEvent } from "@shared/types";

export class WindowsCaptureAdapter implements CaptureAdapter {
  async listSources(): Promise<CaptureSource[]> {
    return [
      {
        id: "windows-backend-pending",
        name: "Windows backend not yet implemented",
        kind: "application",
        isFallback: true
      }
    ];
  }

  async startSession(_sessionId: string, _sourceId: string): Promise<CaptureSession> {
    throw new Error("Windows capture backend is planned but not implemented in this macOS-first release.");
  }

  async stopSession(_sessionId: string): Promise<{ audioPath: string }> {
    throw new Error("Windows capture backend is planned but not implemented in this macOS-first release.");
  }

  onSessionEvent(_sessionId: string, _listener: (event: SessionEvent) => void) {
    return () => undefined;
  }
}
