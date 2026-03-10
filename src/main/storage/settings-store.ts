import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { settingsSchema } from "@shared/contracts";
import type { AppSettings } from "@shared/types";

export class SettingsStore {
  private readonly filePath: string;
  private cache: AppSettings | null = null;

  constructor() {
    const baseDir = app.getPath("userData");
    this.filePath = join(baseDir, "settings.json");
  }

  get(): AppSettings {
    if (this.cache) {
      return this.cache;
    }

    const defaults: AppSettings = {
      openAiApiKey: "",
      transcriptionRelayUrl: process.env.LISN_TRANSCRIPTION_RELAY_URL ?? "https://lisn-transcription-relay.rafaelcg-a0a.workers.dev",
      localModel: "base",
      transcriptDirectory: app.getPath("documents"),
      launchAtLogin: false,
      saveAudioByDefault: false,
      useCloudRefinementByDefault: true
    };

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = settingsSchema.parse(JSON.parse(raw));
      this.cache = parsed;
      return parsed;
    } catch {
      this.persist(defaults);
      return defaults;
    }
  }

  update(partial: Partial<AppSettings>): AppSettings {
    const merged = settingsSchema.parse({
      ...this.get(),
      ...partial
    });

    this.persist(merged);
    app.setLoginItemSettings({
      openAtLogin: merged.launchAtLogin
    });
    return merged;
  }

  private persist(settings: AppSettings) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2));
    this.cache = settings;
  }
}
