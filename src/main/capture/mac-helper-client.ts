import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CaptureSource, SessionEvent } from "@shared/types";

type HelperControlResponse = {
  requestId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
};

export class MacHelperClient {
  private readonly emitter = new EventEmitter();
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private helperProcess: ChildProcessWithoutNullStreams | null = null;
  private connected = false;
  private attachedStdout = false;

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.ensureHelperProcess();
    if (!this.helperProcess) {
      throw new Error("macOS capture helper could not be started. Build it with ./scripts/build-macos-helper.sh or keep Xcode tools available for `swift run`.");
    }

    if (!this.attachedStdout) {
      let buffer = "";
      this.helperProcess.stdout.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines.filter(Boolean)) {
          console.log("[Lissen helper stdout]", line);
          const message = JSON.parse(line) as HelperControlResponse | SessionEvent;
          if ("requestId" in message) {
            const handler = this.pending.get(message.requestId);
            if (!handler) {
              continue;
            }

            this.pending.delete(message.requestId);
            if (message.ok) {
              handler.resolve(message.payload);
            } else {
              handler.reject(new Error(message.error ?? "Unknown helper error"));
            }
          } else if ("sessionId" in message) {
            this.emitter.emit(message.sessionId, message);
          }
        }
      });
      this.attachedStdout = true;
    }

    this.connected = true;
  }

  async listSources(): Promise<CaptureSource[]> {
    return (await this.send("list-sources")) as CaptureSource[];
  }

  async startSession(sessionId: string, sourceId: string): Promise<{ audioPath: string }> {
    return (await this.send("start-session", { sessionId, sourceId })) as { audioPath: string };
  }

  async stopSession(sessionId: string): Promise<{ audioPath: string }> {
    return (await this.send("stop-session", { sessionId })) as { audioPath: string };
  }

  onSessionEvent(sessionId: string, listener: (event: SessionEvent) => void) {
    this.emitter.on(sessionId, listener);
    return () => this.emitter.off(sessionId, listener);
  }

  private async send(command: string, payload?: Record<string, unknown>) {
    const requestId = randomUUID();
    await this.connect();

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.helperProcess?.stdin.write(`${JSON.stringify({ requestId, command, payload })}\n`);
    });
  }

  private ensureHelperProcess() {
    if (this.helperProcess) {
      return;
    }

    const builtBinary = join(process.cwd(), "native", "macos", "LissenCaptureHelper", ".build", "release", "LissenCaptureHelper");
    const helperDir = join(process.cwd(), "native", "macos", "LissenCaptureHelper");

    if (existsSync(builtBinary)) {
      this.helperProcess = spawn(builtBinary, [], {
        stdio: ["pipe", "pipe", "pipe"]
      });
    } else {
      this.helperProcess = spawn("swift", ["run", "--package-path", helperDir, "LissenCaptureHelper"], {
        stdio: ["pipe", "pipe", "pipe"]
      });
    }

    this.helperProcess.stderr.on("data", () => {
      // Consume stderr so helper logging never blocks the process.
    });
    this.helperProcess.stderr.on("data", (chunk) => {
      console.error("[Lissen helper stderr]", chunk.toString("utf8").trim());
    });
    this.helperProcess.on("exit", () => {
      console.error("[Lissen helper exit]");
      this.helperProcess = null;
      this.connected = false;
      this.attachedStdout = false;
    });
  }
}
