export type TranscriptSource = "local" | "cloud";
export type TranscriptStatus = "idle" | "capturing" | "finalizing" | "completed" | "failed";
export type ExportFormat = "markdown" | "txt";
export type SourceKind = "application" | "window";
export type SessionEventType =
  | "status"
  | "segment"
  | "error"
  | "permission"
  | "source-fallback";

export interface CaptureSource {
  id: string;
  name: string;
  kind: SourceKind;
  appName?: string;
  processId?: number;
  isFallback?: boolean;
}

export interface StartSessionInput {
  sourceId: string;
  useCloudRefinement: boolean;
  saveAudio: boolean;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number | null;
  source: TranscriptSource;
}

export interface SessionRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  sourceAppName?: string | null;
  status: TranscriptStatus;
  startedAt: string;
  endedAt?: string | null;
  engine: string;
  usedCloudRefinement: boolean;
  audioPath?: string | null;
  exportPath?: string | null;
  errorMessage?: string | null;
}

export interface SessionWithSegments extends SessionRecord {
  segments: TranscriptSegment[];
}

export interface AppSettings {
  openAiApiKey: string;
  localModel: string;
  transcriptDirectory: string;
  launchAtLogin: boolean;
  saveAudioByDefault: boolean;
  useCloudRefinementByDefault: boolean;
}

export interface RuntimeStatus {
  localTranscriptionAvailable: boolean;
  localTranscriptionReason: string;
  cloudTranscriptionConfigured: boolean;
}

export interface SessionEvent {
  sessionId: string;
  type: SessionEventType;
  message?: string;
  status?: TranscriptStatus;
  segment?: TranscriptSegment;
  fallbackSourceId?: string;
}

export interface LissenApi {
  listSources(): Promise<CaptureSource[]>;
  startSession(input: StartSessionInput): Promise<SessionRecord>;
  stopSession(sessionId: string): Promise<SessionWithSegments>;
  subscribeSessionEvents(sessionId: string, callback: (event: SessionEvent) => void): () => void;
  getSessions(): Promise<SessionRecord[]>;
  getSession(sessionId: string): Promise<SessionWithSegments | null>;
  exportSession(sessionId: string, format: ExportFormat): Promise<string>;
  getSettings(): Promise<AppSettings>;
  updateSettings(nextSettings: Partial<AppSettings>): Promise<AppSettings>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
  openPermissionsSettings(): Promise<void>;
  openDashboard(): Promise<void>;
  chooseTranscriptDirectory(): Promise<string | null>;
}
