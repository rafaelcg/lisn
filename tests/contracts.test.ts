import { describe, expect, it } from "vitest";
import { exportFormatSchema, settingsSchema, startSessionInputSchema } from "../src/shared/contracts";

describe("shared contracts", () => {
  it("accepts valid settings", () => {
    const result = settingsSchema.parse({
      openAiApiKey: "",
      transcriptionRelayUrl: "https://lisn-transcription-relay.rafaelcg-a0a.workers.dev",
      localModel: "base",
      transcriptDirectory: "/tmp",
      launchAtLogin: false,
      saveAudioByDefault: false,
      useCloudRefinementByDefault: true
    });

    expect(result.localModel).toBe("base");
  });

  it("rejects empty source ids", () => {
    expect(() =>
      startSessionInputSchema.parse({
        sourceId: "",
        useCloudRefinement: false,
        saveAudio: false
      })
    ).toThrow();
  });

  it("accepts supported export formats", () => {
    expect(exportFormatSchema.parse("markdown")).toBe("markdown");
    expect(exportFormatSchema.parse("txt")).toBe("txt");
  });
});
