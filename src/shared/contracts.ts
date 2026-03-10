import { z } from "zod";

export const settingsSchema = z.object({
  openAiApiKey: z.string(),
  transcriptionRelayUrl: z.string(),
  localModel: z.string(),
  transcriptDirectory: z.string(),
  launchAtLogin: z.boolean(),
  saveAudioByDefault: z.boolean(),
  useCloudRefinementByDefault: z.boolean()
});

export const startSessionInputSchema = z.object({
  sourceId: z.string().min(1),
  useCloudRefinement: z.boolean(),
  saveAudio: z.boolean()
});

export const exportFormatSchema = z.enum(["markdown", "txt"]);
