import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExportFormat, SessionWithSegments } from "@shared/types";

function sanitizeName(input: string) {
  return input.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "").toLowerCase();
}

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function exportTranscript(
  session: SessionWithSegments,
  format: ExportFormat,
  targetDirectory: string
): string {
  mkdirSync(targetDirectory, { recursive: true });
  const baseName = sanitizeName(`${session.startedAt}-${session.sourceName}`) || session.id;
  const filePath = join(targetDirectory, `${baseName}.${format === "markdown" ? "md" : "txt"}`);

  const body =
    format === "markdown"
      ? [
          `# ${session.sourceName}`,
          "",
          `- Session ID: ${session.id}`,
          `- Started: ${session.startedAt}`,
          `- Ended: ${session.endedAt ?? "in progress"}`,
          `- Engine: ${session.engine}`,
          "",
          ...session.segments.map((segment) => `- [${formatTimestamp(segment.startMs)} - ${formatTimestamp(segment.endMs)}] ${segment.text}`)
        ].join("\n")
      : session.segments.map((segment) => `[${formatTimestamp(segment.startMs)} - ${formatTimestamp(segment.endMs)}] ${segment.text}`).join("\n");

  writeFileSync(filePath, `${body}\n`, "utf8");
  return filePath;
}
