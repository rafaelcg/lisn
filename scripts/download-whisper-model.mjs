import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const modelName = process.argv[2] ?? "base";
const modelMap = {
  base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
};

if (!(modelName in modelMap)) {
  console.error(`Unsupported model: ${modelName}`);
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const targetDir = join(root, "models");
mkdirSync(targetDir, { recursive: true });
const targetPath = join(targetDir, `ggml-${modelName}.bin`);

if (existsSync(targetPath)) {
  console.log(`Model already present: ${targetPath}`);
  process.exit(0);
}

const response = await fetch(modelMap[modelName]);
if (!response.ok || !response.body) {
  throw new Error(`Failed to download ${modelName} model`);
}

await pipeline(response.body, createWriteStream(targetPath));
console.log(`Downloaded ${modelName} model to ${targetPath}`);
