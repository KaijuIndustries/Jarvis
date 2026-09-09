import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const baseUrl = (process.env.HOME_ASSISTANT_URL ?? "").trim().replace(/\/$/, "");
const token = (process.env.HOME_ASSISTANT_TOKEN ?? "").trim();

if (!baseUrl || !token) {
  console.error(
    "HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN must be set in .env or .env.local",
  );
  process.exit(1);
}

const apiRoot = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
const [, command, ...rest] = process.argv;

async function haFetch(path, { method = "GET", body } = {}) {
  const response = await fetch(`${apiRoot}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && typeof parsed.message === "string"
        ? parsed.message
        : `Home Assistant request failed (${response.status})`;
    throw new Error(message);
  }
  return parsed;
}

function printJson(value) {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized.includes(token) || /Bearer\s+\S+/i.test(serialized)) {
    throw new Error("Refusing to print a response that contains the Home Assistant token");
  }
  console.log(serialized);
}

function compact(entity) {
  return {
    entity_id: entity.entity_id,
    name: entity.attributes?.friendly_name ?? entity.entity_id,
    domain: String(entity.entity_id ?? "").split(".")[0],
    state: entity.state,
  };
}

async function main() {
  switch (command) {
    case "auth": {
      const result = await haFetch("/");
      printJson({ ok: true, message: result?.message ?? "API running." });
      return;
    }
    case "entities": {
      const states = await haFetch("/states");
      printJson((Array.isArray(states) ? states : []).map(compact));
      return;
    }
    case "state": {
      const entityId = rest[0];
      if (!entityId) {
        console.error("Usage: node scripts/home-assistant-check.mjs state <entity_id>");
        process.exit(1);
      }
      printJson(compact(await haFetch(`/states/${encodeURIComponent(entityId)}`)));
      return;
    }
    case "call": {
      const [domain, service, entityId] = rest;
      if (!domain || !service || !entityId) {
        console.error(
          "Usage: node scripts/home-assistant-check.mjs call <domain> <service> <entity_id>",
        );
        process.exit(1);
      }
      const result = await haFetch(`/services/${domain}/${service}`, {
        method: "POST",
        body: { entity_id: entityId },
      });
      const changed = Array.isArray(result) ? result.map(compact) : result;
      printJson({ ok: true, action: `${domain}.${service}`, result: changed });
      return;
    }
    default: {
      console.error(`Usage:
  node scripts/home-assistant-check.mjs auth
  node scripts/home-assistant-check.mjs entities
  node scripts/home-assistant-check.mjs state <entity_id>
  node scripts/home-assistant-check.mjs call <domain> <service> <entity_id>`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replaceAll(token, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]"));
  process.exit(1);
});
