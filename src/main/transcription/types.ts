import type { TranscriptSegment } from "@shared/types";
import type { RuntimeStatus } from "@shared/types";

export interface DraftTranscriptionChunk {
  sequence: number;
  pcmPath: string;
}

export interface FinalizedTranscription {
  engine: string;
  segments: TranscriptSegment[];
}

export interface TranscriptionProvider {
  transcribeDraft(sessionId: string, audioPath: string): Promise<FinalizedTranscription>;
  refineWithCloud(sessionId: string, audioPath: string, apiKey: string): Promise<FinalizedTranscription>;
  getRuntimeStatus(apiKey: string): Promise<RuntimeStatus>;
}
