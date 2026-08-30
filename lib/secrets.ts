import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Server-only secret store.
 *
 * Environment `OLLAMA_API_KEY` is the static source.
 * Settings UI writes a gitignored file so the key can be saved/cleared
 * without putting it in the browser or restarting the process.
 * The key is never returned to API callers.
 */
const secretsPath = path.join(process.cwd(), "data", "secrets.json");

type SecretFile = {
  ollamaApiKey?: string;
};

export type SecretSource = "environment" | "server";

export type ApiKeyStatus = {
  configured: boolean;
  source: SecretSource | null;
};

async function readSecretFile(): Promise<SecretFile> {
  try {
    const raw = await readFile(secretsPath, "utf8");
    const parsed = JSON.parse(raw) as SecretFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSecretFile(data: SecretFile): Promise<void> {
  await mkdir(path.dirname(secretsPath), { recursive: true });
  await writeFile(secretsPath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function envApiKey(): string | null {
  const value = process.env.OLLAMA_API_KEY?.trim();
  return value && value.length > 0 ? value : null;
}

export async function getOllamaApiKey(): Promise<{
  key: string | null;
  source: SecretSource | null;
}> {
  const stored = (await readSecretFile()).ollamaApiKey?.trim();
  if (stored) {
    return { key: stored, source: "server" };
  }
  const fromEnv = envApiKey();
  if (fromEnv) {
    return { key: fromEnv, source: "environment" };
  }
  return { key: null, source: null };
}

export async function getOllamaApiKeyStatus(): Promise<ApiKeyStatus> {
  const { key, source } = await getOllamaApiKey();
  return { configured: Boolean(key), source };
}

export async function saveOllamaApiKey(apiKey: string): Promise<ApiKeyStatus> {
  const next = apiKey.trim();
  if (!next) {
    throw new Error("API key is required");
  }
  const current = await readSecretFile();
  await writeSecretFile({ ...current, ollamaApiKey: next });
  return { configured: true, source: "server" };
}

export async function clearOllamaApiKey(): Promise<ApiKeyStatus> {
  const current = await readSecretFile();
  delete current.ollamaApiKey;
  await writeSecretFile(current);
  return getOllamaApiKeyStatus();
}
