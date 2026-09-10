/**
 * Server-side Home Assistant integration.
 * The access token is read from the environment here and is never returned
 * in tool payloads, logs, or thrown error messages.
 */
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_MS = 12 * 60 * 1000;
const MAX_SERVICE_DATA_BYTES = 2_000;
const MAX_ENTITY_NAME_LENGTH = 64;
export const PENDING_CONFIGURATION_TTL_MS = 2 * 60 * 1000;
const UNSUPPORTED_UPDATE_FIELDS = new Set([
  "area_id",
  "device_id",
  "platform",
  "integration",
  "unique_id",
  "disabled_by",
  "hidden_by",
  "new_entity_id",
  "aliases",
  "icon",
  "labels",
  "categories",
  "options",
  "url",
  "method",
  "path",
]);
const SKIP_CATALOG_DOMAINS = new Set([
  "update",
  "sun",
  "zone",
  "persistent_notification",
  "conversation",
  "tts",
  "stt",
  "wake_word",
  "media_source",
  "ffmpeg",
  "image",
  "tag",
  "todo",
  "event",
  "calendar",
  "person",
  "device_tracker",
  "assist_satellite",
]);

const USEFUL_ATTRIBUTES = new Set([
  "device_class",
  "unit_of_measurement",
  "temperature",
  "current_temperature",
  "target_temp_high",
  "target_temp_low",
  "humidity",
  "hvac_mode",
  "hvac_action",
  "fan_mode",
  "brightness",
  "color_temp",
  "color_mode",
  "supported_color_modes",
  "volume_level",
  "media_title",
  "current_position",
  "occupancy",
  "battery",
  "battery_level",
  "area_id",
  "floor",
  "room",
]);

const BLOCKED_SERVICE_DATA_KEYS = /^(authorization|access_token|token|password|headers|url|method)$/i;
const BLOCKED_HA_SERVICES = new Set(["restart", "stop"]);
const ENTITY_ID_RE = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const DOMAIN_RE = /^[a-z][a-z0-9_]*$/;
const SERVICE_RE = /^[a-z][a-z0-9_]*$/;
const LIGHT_WORDS = new Set(["light", "lights", "lamp", "lamps"]);
const PLURAL_WORDS = new Set([
  "lights",
  "lamps",
  "switches",
  "sockets",
  "plugs",
  "scenes",
  "fans",
  "all",
  "both",
]);
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "my",
  "our",
  "please",
  "friday",
  "jarvis",
  "hey",
  "turn",
  "set",
  "to",
  "percent",
  "off",
  "on",
]);

export type HomeAssistantErrorCode =
  | "not_configured"
  | "unauthorized"
  | "not_found"
  | "timeout"
  | "http_error"
  | "invalid_response"
  | "invalid_input";

export class HomeAssistantError extends Error {
  readonly code: HomeAssistantErrorCode;
  readonly status?: number;

  constructor(code: HomeAssistantErrorCode, message: string, status?: number) {
    super(message);
    this.name = "HomeAssistantError";
    this.code = code;
    this.status = status;
  }
}

export type CompactEntity = {
  entity_id: string;
  name: string;
  domain: string;
  state: string;
  area?: string;
  device_class?: string;
  attributes?: Record<string, string | number | boolean>;
  last_changed?: string;
  last_updated?: string;
};

export type HaToolPayload = {
  success: boolean;
  error?: string;
  message?: string;
  entity_id?: string | string[];
  entity_name?: string | string[];
  name?: string;
  domain?: string;
  state?: string;
  area?: string;
  action?: string;
  risk?: "normal" | "high" | "configuration";
  attributes?: Record<string, string | number | boolean>;
  last_changed?: string;
  last_updated?: string;
  count?: number;
  truncated?: boolean;
  entities?: unknown;
  areas?: unknown;
  matches?: Array<{ entity_id: string; name: string }>;
  candidates?: Array<{
    entity_id?: string;
    name: string;
    area?: string;
    area_id?: string;
  }>;
  fields?: string[];
  ok?: boolean;
  changed?: boolean;
  pending_confirmation?: boolean;
  confirmation_id?: string;
  changes?: {
    area?: { from: string | null; to: string };
    name?: { from: string; to: string };
  };
};

export type EntityResolveResult =
  | { status: "resolved"; entities: CompactEntity[] }
  | { status: "ambiguous"; matches: CompactEntity[] }
  | { status: "none" };

type HaState = {
  entity_id?: string;
  state?: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

export type HaArea = {
  area_id: string;
  name: string;
};

export type AreaResolveResult =
  | { status: "resolved"; area: HaArea }
  | { status: "ambiguous"; matches: HaArea[] }
  | { status: "none" };

type HaEntityRegistry = {
  entity_id: string;
  name?: string | null;
  original_name?: string | null;
  area_id?: string | null;
};

export type PendingConfigurationAction = {
  id: string;
  conversationId: string;
  requestId: string;
  tool: "home_assistant.update_entity";
  createdAt: number;
  expiresAt: number;
  entityId: string;
  entityName: string;
  currentName: string;
  currentAreaId: string | null;
  currentAreaName: string | null;
  nextName?: string;
  nextAreaId?: string;
  nextAreaName?: string;
};

type FetchLike = typeof fetch;

let fetchImpl: FetchLike | null = null;
let entityCache: { fetchedAt: number; entities: CompactEntity[] } | null = null;
let cacheInFlight: Promise<CompactEntity[]> | null = null;
let areaCache: { fetchedAt: number; areas: HaArea[] } | null = null;
let areaInFlight: Promise<HaArea[]> | null = null;
const pendingByConversation = new Map<string, PendingConfigurationAction>();
const pendingById = new Map<string, PendingConfigurationAction>();

export function setHomeAssistantFetchForTests(fn: FetchLike | null): void {
  fetchImpl = fn;
}

export function resetHomeAssistantCacheForTests(): void {
  entityCache = null;
  cacheInFlight = null;
  areaCache = null;
  areaInFlight = null;
  pendingByConversation.clear();
  pendingById.clear();
}

export function isHomeAssistantConfigured(): boolean {
  return Boolean(homeAssistantUrl() && homeAssistantToken());
}

export function homeAssistantUrl(): string {
  return trimEnv("HOME_ASSISTANT_URL").replace(/\/$/, "");
}

function homeAssistantToken(): string {
  return trimEnv("HOME_ASSISTANT_TOKEN");
}

function cacheTtlMs(): number {
  const raw = trimEnv("HOME_ASSISTANT_CACHE_MS");
  if (!raw) return DEFAULT_CACHE_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 30_000) return DEFAULT_CACHE_MS;
  return value;
}

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function redactSecrets(text: string): string {
  let out = text;
  const token = homeAssistantToken();
  if (token) out = out.split(token).join("[redacted]");
  return out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function getFetch(): FetchLike {
  return fetchImpl ?? globalThis.fetch.bind(globalThis);
}

function apiRoot(): string {
  const base = homeAssistantUrl();
  if (!base) return "";
  return base.endsWith("/api") ? base : `${base}/api`;
}

function apiUrl(path: string): string {
  const root = apiRoot();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${root}${suffix}`;
}

function mergeSignals(user: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!user) return timeout;
  const any = (
    AbortSignal as typeof AbortSignal & {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  return typeof any === "function" ? any([user, timeout]) : timeout;
}

async function haRequest<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
    rawText?: boolean;
  } = {},
): Promise<T> {
  const url = homeAssistantUrl();
  const token = homeAssistantToken();
  if (!url || !token) {
    throw new HomeAssistantError(
      "not_configured",
      "Home Assistant is not configured",
    );
  }

  let response: Response;
  try {
    response = await getFetch()(apiUrl(path), {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: mergeSignals(init.signal, init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HomeAssistantError("timeout", "Home Assistant request timed out");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new HomeAssistantError(
      "http_error",
      "Home Assistant is unreachable",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new HomeAssistantError(
      "unauthorized",
      "Home Assistant rejected the credentials",
      response.status,
    );
  }

  if (response.status === 404) {
    throw new HomeAssistantError(
      "not_found",
      redactSecrets(await readHaMessage(response, "Entity not found")),
      404,
    );
  }

  if (!response.ok) {
    const message = redactSecrets(
      await readHaMessage(response, `Home Assistant request failed (${response.status})`),
    );
    const code = isNotFoundMessage(message) ? "not_found" : "http_error";
    throw new HomeAssistantError(code, message, response.status);
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null as T;
  }

  if (init.rawText) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed === "string") return parsed as T;
    } catch {
      // Template endpoints often return plain text.
    }
    return text as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HomeAssistantError(
      "invalid_response",
      "Home Assistant returned an invalid response",
      response.status,
    );
  }
}

const AREAS_TEMPLATE =
  "{% for area_id in areas() %}{{ area_id }}|{{ area_name(area_id) }}\n{% endfor %}";
const ENTITY_AREAS_TEMPLATE =
  "{% for s in states %}{% set aid = area_id(s.entity_id) %}{% if aid %}{{ s.entity_id }}|{{ aid }}\n{% endif %}{% endfor %}";

async function haTemplate(template: string, signal?: AbortSignal): Promise<string> {
  return haRequest<string>("/template", {
    method: "POST",
    body: { template },
    signal,
    rawText: true,
  });
}

async function readHaMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Fall through to the status-based message.
  }
  return fallback;
}

function isNotFoundMessage(message: string): boolean {
  return /not found|does not exist|entity .* not|unknown entity/i.test(message);
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof HomeAssistantError && error.code === "not_found";
}

export async function checkHomeAssistantAuth(signal?: AbortSignal): Promise<{
  ok: true;
  message: string;
}> {
  const body = await haRequest<{ message?: string }>("/", { signal });
  return { ok: true, message: body?.message ?? "API running." };
}

export async function fetchHomeAssistantStates(signal?: AbortSignal): Promise<HaState[]> {
  const body = await haRequest<HaState[]>("/states", { signal });
  return Array.isArray(body) ? body : [];
}

export async function fetchHomeAssistantState(
  entityId: string,
  signal?: AbortSignal,
): Promise<HaState> {
  return haRequest<HaState>(`/states/${encodeURIComponent(entityId)}`, { signal });
}

export async function callHomeAssistantService(
  params: {
    domain: string;
    service: string;
    entityId?: string | string[];
    serviceData?: Record<string, unknown>;
    signal?: AbortSignal;
  },
): Promise<HaState[] | null> {
  const body: Record<string, unknown> = { ...(params.serviceData ?? {}) };
  if (params.entityId !== undefined) {
    body.entity_id = params.entityId;
  }
  const result = await haRequest<HaState[] | null>(
    `/services/${encodeURIComponent(params.domain)}/${encodeURIComponent(params.service)}`,
    { method: "POST", body, signal: params.signal },
  );
  return Array.isArray(result) ? result : result;
}

export async function fetchHomeAssistantAreas(
  signal?: AbortSignal,
  force = false,
): Promise<HaArea[]> {
  const now = Date.now();
  if (!force && areaCache && now - areaCache.fetchedAt < cacheTtlMs()) {
    return areaCache.areas;
  }
  if (areaInFlight) {
    if (!force) return areaInFlight;
    try {
      await areaInFlight;
    } catch {
      // Fetch a fresh list after the in-flight request settles.
    }
  }
  areaInFlight = (async () => {
    const rendered = await haTemplate(AREAS_TEMPLATE, signal);
    const areas = parseDelimitedAreas(rendered);
    areaCache = { fetchedAt: Date.now(), areas };
    return areas;
  })().finally(() => {
    areaInFlight = null;
  });
  return areaInFlight;
}

export async function refreshHomeAssistantAreas(signal?: AbortSignal): Promise<HaArea[]> {
  areaCache = null;
  return fetchHomeAssistantAreas(signal, true);
}

export async function fetchEntityRegistryList(
  signal?: AbortSignal,
): Promise<HaEntityRegistry[]> {
  const rendered = await haTemplate(ENTITY_AREAS_TEMPLATE, signal);
  return parseDelimitedEntityAreas(rendered);
}

export async function fetchEntityRegistryEntry(
  entityId: string,
  signal?: AbortSignal,
): Promise<HaEntityRegistry> {
  const body = await haRequest<unknown>(
    `/config/entity_registry/${encodeURIComponent(entityId)}`,
    { signal },
  );
  const entry = parseEntityRegistry(body);
  if (!entry) {
    throw new HomeAssistantError(
      "invalid_response",
      "Home Assistant returned an invalid entity registry entry",
    );
  }
  return entry;
}

export async function updateEntityRegistry(
  params: {
    entityId: string;
    areaId?: string | null;
    name?: string;
    signal?: AbortSignal;
  },
): Promise<HaEntityRegistry | null> {
  const body: Record<string, unknown> = { entity_id: params.entityId };
  if (params.areaId !== undefined) body.area_id = params.areaId;
  if (params.name !== undefined) body.name = params.name;
  const result = await haRequest<unknown>("/config/entity_registry/update", {
    method: "POST",
    body,
    signal: params.signal,
  });
  if (result == null) return null;
  const parsed = parseEntityRegistry(result);
  if (!parsed) {
    throw new HomeAssistantError(
      "invalid_response",
      "Home Assistant returned an invalid entity registry update",
    );
  }
  return parsed;
}

export function parseDelimitedAreas(text: string): HaArea[] {
  const areas: HaArea[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "None" || trimmed === "null") continue;
    const separator = trimmed.indexOf("|");
    if (separator <= 0) continue;
    const areaId = trimmed.slice(0, separator).trim();
    const name = trimmed.slice(separator + 1).trim();
    if (!areaId || !name || seen.has(areaId)) continue;
    seen.add(areaId);
    areas.push({ area_id: areaId, name });
  }
  return areas;
}

export function parseDelimitedEntityAreas(text: string): HaEntityRegistry[] {
  const entries: HaEntityRegistry[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("|");
    if (separator <= 0) continue;
    const entityId = validateEntityId(trimmed.slice(0, separator).trim());
    const areaId = trimmed.slice(separator + 1).trim();
    if (!entityId || !areaId || seen.has(entityId)) continue;
    seen.add(entityId);
    entries.push({ entity_id: entityId, area_id: areaId });
  }
  return entries;
}

export function parseAreaList(body: unknown): HaArea[] {
  const raw = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? ((body as { result?: unknown; areas?: unknown }).result ??
        (body as { areas?: unknown }).areas)
      : null;
  if (!Array.isArray(raw)) {
    throw new HomeAssistantError(
      "invalid_response",
      "Home Assistant returned an invalid area list",
    );
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { area_id?: unknown; name?: unknown };
      const areaId = typeof row.area_id === "string" ? row.area_id.trim() : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!areaId || !name) return null;
      return { area_id: areaId, name };
    })
    .filter((area): area is HaArea => Boolean(area));
}

export function parseEntityRegistryList(body: unknown): HaEntityRegistry[] {
  const raw = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? ((body as { result?: unknown }).result ??
        (body as { entities?: unknown }).entities)
      : null;
  if (!Array.isArray(raw)) {
    throw new HomeAssistantError(
      "invalid_response",
      "Home Assistant returned an invalid entity registry list",
    );
  }
  return raw
    .map((item) => parseEntityRegistry(item))
    .filter((entry): entry is HaEntityRegistry => Boolean(entry));
}

export function parseEntityRegistry(body: unknown): HaEntityRegistry | null {
  const raw =
    body && typeof body === "object" && "result" in body
      ? (body as { result: unknown }).result
      : body;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    entity_id?: unknown;
    name?: unknown;
    original_name?: unknown;
    area_id?: unknown;
  };
  if (typeof row.entity_id !== "string" || !validateEntityId(row.entity_id)) {
    return null;
  }
  return {
    entity_id: row.entity_id,
    name: typeof row.name === "string" ? row.name : row.name === null ? null : undefined,
    original_name:
      typeof row.original_name === "string"
        ? row.original_name
        : row.original_name === null
          ? null
          : undefined,
    area_id:
      typeof row.area_id === "string"
        ? row.area_id
        : row.area_id === null
          ? null
          : undefined,
  };
}

/** Title-case a spoken area so "kitchen" and "KITCHEN" both become "Kitchen". */
export function titleCaseAreaName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function resolveAreas(areas: HaArea[], query: string): AreaResolveResult {
  const needle = query.trim().toLowerCase();
  if (!needle) return { status: "none" };
  const matches = areas.filter((area) => area.name.trim().toLowerCase() === needle);
  if (matches.length === 1) return { status: "resolved", area: matches[0] };
  if (matches.length > 1) {
    const uniqueNames = new Set(matches.map((area) => area.name.trim()));
    if (uniqueNames.size === 1) return { status: "ambiguous", matches };
    const titled = titleCaseAreaName(query);
    const preferred = matches.filter((area) => area.name.trim() === titled);
    if (preferred.length === 1) return { status: "resolved", area: preferred[0] };
    return { status: "ambiguous", matches };
  }
  return { status: "none" };
}

export function validateEntityName(value: string): string | null {
  const name = value.trim();
  if (!name) return null;
  if (name.length > MAX_ENTITY_NAME_LENGTH) return null;
  if (/^\s*https?:\/\//i.test(name)) return null;
  if (/[\r\n]/.test(name)) return null;
  return name;
}

export function isAffirmativeConfirmation(text: string): boolean {
  const value = text.trim();
  if (/^yesterday\b/i.test(value)) return false;
  return /^(yes|yeah|yep|yup|ok|okay|sure|do it|please do|confirm|go ahead|affirmative)\b/i.test(
    value,
  );
}

export function isNegativeConfirmation(text: string): boolean {
  return /^(no|nope|cancel|don't|do not|never mind|nevermind|stop)\b/i.test(text.trim());
}

export function peekPendingConfiguration(
  conversationId: string,
  now = Date.now(),
): PendingConfigurationAction | null {
  const pending = pendingByConversation.get(conversationId);
  if (!pending) return null;
  if (pending.expiresAt <= now) {
    forgetPending(pending.id);
    return null;
  }
  return pending;
}

export function getPendingConfigurationById(
  confirmationId: string,
  now = Date.now(),
): PendingConfigurationAction | null {
  const pending = pendingById.get(confirmationId);
  if (!pending) return null;
  if (pending.expiresAt <= now) {
    forgetPending(pending.id);
    return null;
  }
  return pending;
}

function rememberPending(action: PendingConfigurationAction): void {
  const previous = pendingByConversation.get(action.conversationId);
  if (previous) forgetPending(previous.id);
  pendingByConversation.set(action.conversationId, action);
  pendingById.set(action.id, action);
}

function forgetPending(confirmationId: string): void {
  const pending = pendingById.get(confirmationId);
  pendingById.delete(confirmationId);
  if (pending && pendingByConversation.get(pending.conversationId)?.id === confirmationId) {
    pendingByConversation.delete(pending.conversationId);
  }
}

export function cancelPendingConfiguration(conversationId: string): boolean {
  const pending = pendingByConversation.get(conversationId);
  if (!pending) return false;
  forgetPending(pending.id);
  return true;
}

function invalidateDiscoveryCaches(): void {
  entityCache = null;
  areaCache = null;
}

export type HomeAssistantCatalogStatus = {
  configured: boolean;
  entityCount: number | null;
  areaCount: number | null;
  refreshedAt: number | null;
};

export function getHomeAssistantCatalogStatus(): HomeAssistantCatalogStatus {
  const entityAt = entityCache?.fetchedAt ?? null;
  const areaAt = areaCache?.fetchedAt ?? null;
  const refreshedAt =
    entityAt != null && areaAt != null
      ? Math.min(entityAt, areaAt)
      : (entityAt ?? areaAt);
  return {
    configured: isHomeAssistantConfigured(),
    entityCount: entityCache ? entityCache.entities.length : null,
    areaCount: areaCache ? areaCache.areas.length : null,
    refreshedAt,
  };
}

export async function refreshHomeAssistantCatalog(
  signal?: AbortSignal,
): Promise<HomeAssistantCatalogStatus> {
  if (!isHomeAssistantConfigured()) {
    throw new HomeAssistantError(
      "not_configured",
      "Home Assistant is not configured",
    );
  }
  const pending = [cacheInFlight, areaInFlight].filter(
    (value) => value != null,
  );
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
  invalidateDiscoveryCaches();
  const entities = await getCachedEntities({ force: true, signal });
  const areas = await fetchHomeAssistantAreas(signal);
  return {
    configured: true,
    entityCount: entities.length,
    areaCount: areas.length,
    refreshedAt: Date.now(),
  };
}

export function compactEntity(state: HaState): CompactEntity | null {
  const entityId = state.entity_id?.trim() ?? "";
  if (!ENTITY_ID_RE.test(entityId)) return null;
  const attributes = state.attributes ?? {};
  const name =
    stringAttr(attributes.friendly_name) ||
    entityId.split(".")[1]?.replace(/_/g, " ") ||
    entityId;
  const area =
    stringAttr(attributes.area) ||
    stringAttr(attributes.area_id) ||
    stringAttr(attributes.room) ||
    undefined;
  const deviceClass = stringAttr(attributes.device_class) || undefined;
  const compactAttrs: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!USEFUL_ATTRIBUTES.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      compactAttrs[key] = value;
    }
  }
  return {
    entity_id: entityId,
    name,
    domain: entityId.split(".")[0] ?? "",
    state: typeof state.state === "string" ? state.state : String(state.state ?? ""),
    area,
    device_class: deviceClass,
    attributes: Object.keys(compactAttrs).length > 0 ? compactAttrs : undefined,
    last_changed: typeof state.last_changed === "string" ? state.last_changed : undefined,
    last_updated: typeof state.last_updated === "string" ? state.last_updated : undefined,
  };
}

function stringAttr(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getCachedEntities(options?: {
  force?: boolean;
  signal?: AbortSignal;
}): Promise<CompactEntity[]> {
  const now = Date.now();
  if (
    !options?.force &&
    entityCache &&
    now - entityCache.fetchedAt < cacheTtlMs()
  ) {
    return entityCache.entities;
  }
  if (cacheInFlight) {
    if (!options?.force) return cacheInFlight;
    try {
      await cacheInFlight;
    } catch {
      // Fetch a fresh catalogue after the in-flight request settles.
    }
  }
  cacheInFlight = (async () => {
    const states = await fetchHomeAssistantStates(options?.signal);
    const [areas, registry] = await Promise.all([
      fetchHomeAssistantAreas(options?.signal, Boolean(options?.force)),
      fetchEntityRegistryList(options?.signal),
    ]);
    const entities = applyEntityAreas(
      states
        .map((state) => compactEntity(state))
        .filter((entity): entity is CompactEntity => entity !== null),
      registry,
      areas,
    );
    entityCache = { fetchedAt: Date.now(), entities };
    return entities;
  })().finally(() => {
    cacheInFlight = null;
  });
  return cacheInFlight;
}

export function applyEntityAreas(
  entities: CompactEntity[],
  registry: HaEntityRegistry[],
  areas: HaArea[],
): CompactEntity[] {
  const areaNameById = new Map(areas.map((area) => [area.area_id, area.name]));
  const areaIdByEntity = new Map<string, string>();
  for (const entry of registry) {
    if (entry.area_id) areaIdByEntity.set(entry.entity_id, entry.area_id);
  }
  return entities.map((entity) => {
    const areaId = areaIdByEntity.get(entity.entity_id);
    const joined = areaId ? areaNameById.get(areaId) : undefined;
    if (!joined) return entity;
    return { ...entity, area: joined };
  });
}

export async function refreshHomeAssistantEntities(signal?: AbortSignal): Promise<CompactEntity[]> {
  return getCachedEntities({ force: true, signal });
}

export function filterEntities(
  entities: CompactEntity[],
  filters?: { domain?: string; area?: string; search?: string },
): CompactEntity[] {
  const domain = filters?.domain?.trim().toLowerCase();
  const area = filters?.area?.trim().toLowerCase();
  const search = filters?.search?.trim().toLowerCase();
  return entities.filter((entity) => {
    if (domain && entity.domain !== domain) return false;
    if (area) {
      const hay = `${entity.area ?? ""} ${entity.name} ${entity.entity_id}`.toLowerCase();
      if (!hay.includes(area)) return false;
    }
    if (search) {
      const hay = `${entity.name} ${entity.entity_id} ${entity.area ?? ""} ${entity.device_class ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

export function validateEntityId(entityId: string): string | null {
  const value = entityId.trim().toLowerCase();
  if (!ENTITY_ID_RE.test(value)) return null;
  return value;
}

export function validateDomain(domain: string): string | null {
  const value = domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(value)) return null;
  return value;
}

export function validateService(service: string): string | null {
  const value = service.trim().toLowerCase();
  if (!SERVICE_RE.test(value)) return null;
  return value;
}

export function validateServiceData(
  value: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, data: {} };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_service_data" };
  }
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (
    keys.includes("__proto__") ||
    keys.includes("constructor") ||
    keys.includes("prototype")
  ) {
    return { ok: false, error: "invalid_service_data" };
  }
  if (keys.length > 20) {
    return { ok: false, error: "invalid_service_data" };
  }
  for (const key of keys) {
    if (BLOCKED_SERVICE_DATA_KEYS.test(key)) {
      return { ok: false, error: "invalid_service_data" };
    }
    const entry = data[key];
    if (!isPlainServiceValue(entry)) {
      return { ok: false, error: "invalid_service_data" };
    }
  }
  const encoded = JSON.stringify(data);
  if (encoded.length > MAX_SERVICE_DATA_BYTES) {
    return { ok: false, error: "invalid_service_data" };
  }
  return { ok: true, data };
}

function isPlainServiceValue(value: unknown, depth = 0): boolean {
  if (depth > 2) return false;
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (typeof value === "string") {
    return !/^\s*https?:\/\//i.test(value);
  }
  if (Array.isArray(value)) {
    return value.length <= 32 && value.every((item) => isPlainServiceValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).every(
      ([key, entry]) =>
        !BLOCKED_SERVICE_DATA_KEYS.test(key) && isPlainServiceValue(entry, depth + 1),
    );
  }
  return false;
}

export function actionRisk(
  domain: string,
  service: string,
): "normal" | "high" | "configuration" {
  if (domain === "home_assistant" && service === "update_entity") {
    return "configuration";
  }
  if (domain === "lock" && service === "unlock") return "high";
  if (domain === "alarm_control_panel" && /disarm|arm_home|arm_away/.test(service)) {
    return "high";
  }
  if (domain === "cover" && /open/.test(service)) return "high";
  return "normal";
}

export function resolveEntities(
  entities: CompactEntity[],
  query: {
    entity_id?: string | string[];
    name?: string;
    search?: string;
    domain?: string;
    allowMultiple?: boolean;
  },
): EntityResolveResult {
  if (query.entity_id !== undefined) {
    const ids = (Array.isArray(query.entity_id) ? query.entity_id : [query.entity_id])
      .map((id) => validateEntityId(id))
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return { status: "none" };
    const found = ids
      .map((id) => entities.find((entity) => entity.entity_id === id))
      .filter((entity): entity is CompactEntity => Boolean(entity));
    if (found.length === ids.length) {
      return { status: "resolved", entities: found };
    }
    if (found.length === 0) return { status: "none" };
    return { status: "none" };
  }

  const raw = (query.name ?? query.search ?? "").trim();
  if (!raw) return { status: "none" };
  const tokens = tokenize(raw);
  if (tokens.length === 0) return { status: "none" };

  const domain = query.domain?.trim().toLowerCase() || inferDomain(tokens);
  const pool = domain ? entities.filter((entity) => entity.domain === domain) : entities;
  const scored = pool
    .map((entity) => ({ entity, score: scoreEntity(entity, tokens) }))
    .filter((entry) => entry.score >= 70)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { status: "none" };
  if (scored.length === 1) {
    return { status: "resolved", entities: [scored[0].entity] };
  }
  const plural = query.allowMultiple || tokens.some((token) => PLURAL_WORDS.has(token));
  if (plural && scored.every((entry) => entry.entity.domain === scored[0].entity.domain)) {
    return { status: "resolved", entities: scored.map((entry) => entry.entity) };
  }
  return { status: "ambiguous", matches: scored.map((entry) => entry.entity) };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s.]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function inferDomain(tokens: string[]): string | undefined {
  if (tokens.some((token) => LIGHT_WORDS.has(token))) return "light";
  if (tokens.some((token) => token === "switch" || token === "switches" || token === "socket" || token === "plug")) {
    return "switch";
  }
  if (tokens.some((token) => token === "scene" || token === "scenes")) return "scene";
  if (tokens.some((token) => token === "fan" || token === "fans")) return "fan";
  if (tokens.some((token) => token === "climate" || token === "thermostat" || token === "heating")) {
    return "climate";
  }
  return undefined;
}

function scoreEntity(entity: CompactEntity, tokens: string[]): number {
  const nameTokens = tokenize(entity.name);
  const hay = new Set([
    ...nameTokens,
    ...entity.entity_id.split(/[._]/),
    ...tokenize(entity.area ?? ""),
    entity.domain,
  ]);
  if (entity.domain === "light") {
    hay.add("light");
    hay.add("lamp");
    hay.add("lights");
  }
  const matched = tokens.filter(
    (token) => hay.has(token) || (LIGHT_WORDS.has(token) && entity.domain === "light"),
  );
  if (matched.length !== tokens.length) return 0;
  const name = nameTokens.join(" ");
  const query = tokens.join(" ");
  if (name === query) return 100;
  const withoutLight = tokens.filter((token) => !LIGHT_WORDS.has(token)).join(" ");
  if (name === withoutLight) return 96;
  if (entity.entity_id.replace(/[._]/g, " ") === query) return 94;
  return 80 - Math.max(0, nameTokens.length - tokens.length);
}

export function listingForLlm(entity: CompactEntity): Record<string, unknown> {
  const item: Record<string, unknown> = {
    name: entity.name,
    domain: entity.domain,
    state: entity.state,
  };
  if (entity.area) item.area = entity.area;
  if (entity.device_class) item.device_class = entity.device_class;
  if (entity.attributes && Object.keys(entity.attributes).length > 0) {
    item.attributes = entity.attributes;
  }
  item.entity_id = entity.entity_id;
  return item;
}

export function matchSummary(entity: CompactEntity): { entity_id: string; name: string } {
  return { entity_id: entity.entity_id, name: entity.name };
}

function toolError(error: string, extra: Record<string, unknown> = {}): HaToolPayload {
  return { success: false, error, ...extra };
}

function toPayloadError(error: unknown): HaToolPayload {
  if (error instanceof HomeAssistantError) {
    return toolError(error.code, { message: redactSecrets(error.message) });
  }
  if (error instanceof Error && error.name === "AbortError") {
    return toolError("timeout", { message: "Home Assistant request was cancelled" });
  }
  return toolError("http_error", { message: "Home Assistant request failed" });
}

export async function executeGetAreas(signal?: AbortSignal): Promise<HaToolPayload> {
  if (!isHomeAssistantConfigured()) {
    return toolError("not_configured", { message: "Home Assistant is not configured" });
  }
  try {
    const areas = await refreshHomeAssistantAreas(signal);
    return {
      success: true,
      count: areas.length,
      areas: areas.map((area) => ({ name: area.name })),
    };
  } catch (error) {
    return toPayloadError(error);
  }
}

export async function executeGetEntities(
  input: { domain?: string; area?: string; search?: string },
  signal?: AbortSignal,
): Promise<HaToolPayload> {
  if (!isHomeAssistantConfigured()) {
    return toolError("not_configured", { message: "Home Assistant is not configured" });
  }
  try {
    let entities = filterEntities(await getCachedEntities({ signal }), input);
    if (entities.length === 0 && (input.domain || input.area || input.search)) {
      entities = filterEntities(await refreshHomeAssistantEntities(signal), input);
    }
    const truncated = entities.length > 80;
    const items = (truncated ? entities.slice(0, 80) : entities).map(listingForLlm);
    return {
      success: true,
      count: entities.length,
      truncated,
      entities: items,
    };
  } catch (error) {
    return toPayloadError(error);
  }
}

export async function executeGetState(
  input: { entity_id?: string; name?: string },
  signal?: AbortSignal,
): Promise<HaToolPayload> {
  if (!isHomeAssistantConfigured()) {
    return toolError("not_configured", { message: "Home Assistant is not configured" });
  }
  try {
    const resolved = await resolveForLiveCall(input, signal);
    if (!resolved.ok) return resolved.payload;
    try {
      return await readStates(resolved.entities, signal);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const retried = await retryAfterUnknown(
        input,
        resolved.entities[0]?.entity_id ?? "",
        signal,
      );
      if (!retried.ok) return retried.payload;
      return readStates(retried.entities, signal);
    }
  } catch (error) {
    return toPayloadError(error);
  }
}

export async function executeCallService(
  input: {
    domain?: string;
    service?: string;
    entity_id?: string | string[];
    name?: string;
    service_data?: Record<string, unknown>;
  },
  signal?: AbortSignal,
): Promise<HaToolPayload> {
  if (!isHomeAssistantConfigured()) {
    return toolError("not_configured", { message: "Home Assistant is not configured" });
  }

  const domain = input.domain ? validateDomain(input.domain) : null;
  const service = input.service ? validateService(input.service) : null;
  if (!domain || !service) {
    return toolError("invalid_input", { message: "domain and service are required" });
  }
  if (domain === "homeassistant" && BLOCKED_HA_SERVICES.has(service)) {
    return toolError("invalid_input", { message: "That Home Assistant service is not allowed" });
  }
  const data = validateServiceData(input.service_data);
  if (!data.ok) {
    return toolError(data.error);
  }

  try {
    const resolved = await resolveForLiveCall(input, signal);
    if (!resolved.ok) return resolved.payload;
    const entityIds = resolved.entities.map((entity) => entity.entity_id);
    const names = new Map(resolved.entities.map((entity) => [entity.entity_id, entity.name]));

    try {
      const states = await callHomeAssistantService({
        domain,
        service,
        entityId: entityIds.length === 1 ? entityIds[0] : entityIds,
        serviceData: data.data,
        signal,
      });
      return serviceSuccess(domain, service, entityIds, names, states);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const retried = await retryAfterUnknown(input, entityIds[0], signal);
      if (!retried.ok) return retried.payload;
      const retryIds = retried.entities.map((entity) => entity.entity_id);
      const retryNames = new Map(
        retried.entities.map((entity) => [entity.entity_id, entity.name]),
      );
      const states = await callHomeAssistantService({
        domain,
        service,
        entityId: retryIds.length === 1 ? retryIds[0] : retryIds,
        serviceData: data.data,
        signal,
      });
      return serviceSuccess(domain, service, retryIds, retryNames, states);
    }
  } catch (error) {
    return toPayloadError(error);
  }
}

function serviceSuccess(
  domain: string,
  service: string,
  entityIds: string[],
  names: Map<string, string>,
  states: HaState[] | null,
): HaToolPayload {
  const compact = (states ?? [])
    .map((state) => compactEntity(state))
    .filter((entity): entity is CompactEntity => Boolean(entity));
  const primary =
    compact.find((entity) => entity.entity_id === entityIds[0]) ?? compact[0];
  const payload: HaToolPayload = {
    success: true,
    entity_id: entityIds.length === 1 ? entityIds[0] : entityIds,
    entity_name:
      entityIds.length === 1
        ? names.get(entityIds[0]) ?? primary?.name
        : entityIds.map((id) => names.get(id) ?? id),
    action: `${domain}.${service}`,
    risk: actionRisk(domain, service),
  };
  if (primary) {
    payload.state = primary.state;
    if (primary.attributes) payload.attributes = primary.attributes;
  }
  return payload;
}

async function readStates(
  entities: CompactEntity[],
  signal?: AbortSignal,
): Promise<HaToolPayload> {
  const states: HaToolPayload[] = [];
  for (const entity of entities) {
    states.push(statePayload(await fetchHomeAssistantState(entity.entity_id, signal)));
  }
  if (states.length === 1) return states[0];
  return { success: true, count: states.length, entities: states };
}

function statePayload(state: HaState): HaToolPayload {
  const entity = compactEntity(state);
  if (!entity) {
    return toolError("invalid_response", { message: "Home Assistant returned an invalid entity" });
  }
  return {
    success: true,
    entity_id: entity.entity_id,
    entity_name: entity.name,
    domain: entity.domain,
    state: entity.state,
    area: entity.area,
    attributes: entity.attributes,
    last_changed: entity.last_changed,
    last_updated: entity.last_updated,
  };
}

type LiveEntities =
  | { ok: true; entities: CompactEntity[] }
  | { ok: false; payload: HaToolPayload };

async function resolveForLiveCall(
  input: { entity_id?: string | string[]; name?: string; domain?: string },
  signal?: AbortSignal,
  refreshed = false,
): Promise<LiveEntities> {
  const ids = input.entity_id;
  if (typeof ids === "string" || Array.isArray(ids)) {
    const list = Array.isArray(ids) ? ids : [ids];
    const valid = list
      .map((id) => validateEntityId(String(id)))
      .filter((id): id is string => Boolean(id));
    if (valid.length !== list.length) {
      return {
        ok: false,
        payload: toolError("invalid_input", { message: "entity_id is invalid" }),
      };
    }
    const cached = entityCache?.entities ?? [];
    const fromCache = valid
      .map((id) => cached.find((entity) => entity.entity_id === id))
      .filter((entity): entity is CompactEntity => Boolean(entity));
    if (fromCache.length === valid.length) {
      return { ok: true, entities: fromCache };
    }
    return {
      ok: true,
      entities: valid.map((id) => ({
        entity_id: id,
        name: fromCache.find((entity) => entity.entity_id === id)?.name ?? id,
        domain: id.split(".")[0] ?? "",
        state: "unknown",
      })),
    };
  }

  const name = input.name?.trim() ?? "";
  const namedId = validateEntityId(name);
  if (namedId) {
    return resolveForLiveCall(
      { ...input, entity_id: namedId, name: undefined },
      signal,
      refreshed,
    );
  }
  if (!name) {
    return {
      ok: false,
      payload: toolError("invalid_input", { message: "entity_id or name is required" }),
    };
  }
  let cached = await getCachedEntities({ signal });
  let resolved = resolveEntities(cached, {
    name,
    domain: input.domain,
    allowMultiple: false,
  });
  if (resolved.status === "none" && !refreshed) {
    cached = await refreshHomeAssistantEntities(signal);
    resolved = resolveEntities(cached, { name, domain: input.domain });
  }
  if (resolved.status === "ambiguous") {
    return {
      ok: false,
      payload: toolError("ambiguous_entity", {
        matches: resolved.matches.map(matchSummary),
      }),
    };
  }
  if (resolved.status === "none") {
    return { ok: false, payload: toolError("entity_not_found", { name }) };
  }
  return { ok: true, entities: resolved.entities };
}

async function retryAfterUnknown(
  input: { entity_id?: string | string[]; name?: string; domain?: string },
  attemptedId: string,
  signal?: AbortSignal,
): Promise<LiveEntities> {
  const cached = await refreshHomeAssistantEntities(signal);
  if (validateEntityId(attemptedId) && cached.some((entity) => entity.entity_id === attemptedId)) {
    const entity = cached.find((item) => item.entity_id === attemptedId);
    if (entity) return { ok: true, entities: [entity] };
  }
  const name =
    input.name?.trim() ||
    (typeof input.entity_id === "string"
      ? input.entity_id.split(".")[1]?.replace(/_/g, " ") ?? ""
      : "");
  if (!name) {
    return {
      ok: false,
      payload: toolError("entity_not_found", { entity_id: attemptedId }),
    };
  }
  const resolved = resolveEntities(cached, {
    name,
    domain: input.domain || attemptedId.split(".")[0],
  });
  if (resolved.status === "ambiguous") {
    return {
      ok: false,
      payload: toolError("ambiguous_entity", { matches: resolved.matches.map(matchSummary) }),
    };
  }
  if (resolved.status === "none") {
    return {
      ok: false,
      payload: toolError("entity_not_found", {
        entity_id: attemptedId,
        name: input.name,
      }),
    };
  }
  return { ok: true, entities: resolved.entities };
}

export async function executeUpdateEntity(
  input: {
    entity_id?: string | string[];
    name?: string;
    area?: string;
    search?: string;
    query?: string;
    confirm?: boolean;
    confirmation_id?: string;
    unsupported_fields?: string[];
  },
  context: {
    signal?: AbortSignal;
    conversationId?: string;
    requestId?: string;
    now?: number;
  } = {},
): Promise<HaToolPayload> {
  if (!isHomeAssistantConfigured()) {
    return withOk(toolError("not_configured", { message: "Home Assistant is not configured" }));
  }
  if (input.unsupported_fields?.some((field) => UNSUPPORTED_UPDATE_FIELDS.has(field))) {
    return withOk(
      toolError("invalid_input", {
        message: "Unsupported entity registry fields were rejected",
        fields: input.unsupported_fields.filter((field) =>
          UNSUPPORTED_UPDATE_FIELDS.has(field),
        ),
      }),
    );
  }

  const now = context.now ?? Date.now();
  const conversationId = context.conversationId?.trim() || "default";
  if (input.confirm) {
    return confirmEntityUpdate(input, { ...context, conversationId, now });
  }

  try {
    const prepared = await prepareEntityUpdate(input, context.signal);
    if (!isPreparedUpdate(prepared)) return withOk(prepared);

    if (!prepared.changed) {
      return withOk({
        success: true,
        ok: true,
        changed: false,
        entity_id: prepared.entityId,
        name: prepared.entityName,
        message: prepared.noopMessage,
        risk: "configuration",
      });
    }

    const pending: PendingConfigurationAction = {
      id: createConfirmationId(),
      conversationId,
      requestId: context.requestId ?? createConfirmationId(),
      tool: "home_assistant.update_entity",
      createdAt: now,
      expiresAt: now + PENDING_CONFIGURATION_TTL_MS,
      entityId: prepared.entityId,
      entityName: prepared.entityName,
      currentName: prepared.currentName,
      currentAreaId: prepared.currentAreaId,
      currentAreaName: prepared.currentAreaName,
      nextName: prepared.nextName,
      nextAreaId: prepared.nextAreaId,
      nextAreaName: prepared.nextAreaName,
    };
    rememberPending(pending);
    return withOk({
      success: true,
      ok: true,
      changed: false,
      pending_confirmation: true,
      confirmation_id: pending.id,
      entity_id: prepared.entityId,
      name: prepared.entityName,
      risk: "configuration",
      changes: prepared.changes,
      message: prepared.confirmMessage,
    });
  } catch (error) {
    return withOk(toUpdateError(error));
  }
}

export async function settlePendingConfiguration(
  conversationId: string,
  userText: string,
  options: { signal?: AbortSignal; requestId?: string; now?: number } = {},
): Promise<
  | { kind: "executed"; payload: HaToolPayload }
  | { kind: "cancelled"; payload: HaToolPayload }
  | { kind: "none" }
> {
  const now = options.now ?? Date.now();
  const pending = peekPendingConfiguration(conversationId, now);
  if (!pending) return { kind: "none" };

  if (isAffirmativeConfirmation(userText)) {
    const payload = await applyPreparedUpdate(pending, options.signal);
    forgetPending(pending.id);
    return { kind: "executed", payload: withOk(payload) };
  }
  if (isNegativeConfirmation(userText)) {
    forgetPending(pending.id);
    return {
      kind: "cancelled",
      payload: withOk({
        success: true,
        ok: true,
        changed: false,
        message: "Cancelled the Home Assistant configuration change.",
      }),
    };
  }
  forgetPending(pending.id);
  return { kind: "none" };
}

async function confirmEntityUpdate(
  input: {
    confirmation_id?: string;
    entity_id?: string | string[];
    name?: string;
    area?: string;
  },
  context: { conversationId: string; requestId?: string; signal?: AbortSignal; now: number },
): Promise<HaToolPayload> {
  const pending = input.confirmation_id
    ? getPendingConfigurationById(input.confirmation_id, context.now)
    : peekPendingConfiguration(context.conversationId, context.now);
  if (!pending || pending.conversationId !== context.conversationId) {
    return withOk(
      toolError("confirmation_required", {
        message: "There is no matching pending Home Assistant configuration change.",
      }),
    );
  }
  if (context.requestId && pending.requestId === context.requestId) {
    return withOk(
      toolError("confirmation_required", {
        message: "Wait for the user to confirm this Home Assistant configuration change.",
      }),
    );
  }
  if (input.confirmation_id && pending.id !== input.confirmation_id) {
    return withOk(
      toolError("confirmation_required", {
        message: "That confirmation does not match the pending configuration change.",
      }),
    );
  }
  forgetPending(pending.id);
  return withOk(await applyPreparedUpdate(pending, context.signal));
}

type PreparedEntityUpdate = {
  changed: boolean;
  entityId: string;
  entityName: string;
  currentName: string;
  currentAreaId: string | null;
  currentAreaName: string | null;
  nextName?: string;
  nextAreaId?: string;
  nextAreaName?: string;
  changes: NonNullable<HaToolPayload["changes"]>;
  noopMessage: string;
  confirmMessage: string;
};

async function prepareEntityUpdate(
  input: {
    entity_id?: string | string[];
    name?: string;
    area?: string;
    search?: string;
    query?: string;
  },
  signal?: AbortSignal,
): Promise<PreparedEntityUpdate | HaToolPayload> {
  const areaName = typeof input.area === "string" ? titleCaseAreaName(input.area) : "";
  const nextName = input.name === undefined || input.name === null
    ? undefined
    : validateEntityName(String(input.name));
  if (input.name !== undefined && input.name !== null && !nextName) {
    return toolError("invalid_input", { message: "name is empty or invalid" });
  }
  if (!areaName && !nextName) {
    return toolError("invalid_input", {
      message: "area or name is required",
    });
  }

  const resolved = await resolveUpdateEntity(input, signal);
  if (!resolved.ok) {
    const payload = resolved.payload;
    if (payload.error === "ambiguous_entity" && !payload.candidates && payload.matches) {
      return {
        ...payload,
        candidates: payload.matches.map((match) => ({
          entity_id: match.entity_id,
          name: match.name,
        })),
      };
    }
    return payload;
  }
  if (resolved.entities.length !== 1) {
    return toolError("ambiguous_entity", {
      candidates: resolved.entities.map(candidateSummary),
      matches: resolved.entities.map(matchSummary),
    });
  }
  const entity = resolved.entities[0];

  let registry: HaEntityRegistry;
  try {
    registry = await fetchEntityRegistryEntry(entity.entity_id, signal);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    const retried = await retryAfterUnknown(
      {
        entity_id: entity.entity_id,
        name: input.search ?? input.query,
      },
      entity.entity_id,
      signal,
    );
    if (!retried.ok) return retried.payload;
    if (retried.entities.length !== 1) {
      return toolError("ambiguous_entity", {
        candidates: retried.entities.map(candidateSummary),
        matches: retried.entities.map(matchSummary),
      });
    }
    try {
      registry = await fetchEntityRegistryEntry(retried.entities[0].entity_id, signal);
    } catch (retryError) {
      if (isNotFoundError(retryError)) {
        return toolError("entity_not_found", { entity_id: retried.entities[0].entity_id });
      }
      throw retryError;
    }
  }

  const areas = await refreshHomeAssistantAreas(signal);
  let nextArea: HaArea | undefined;
  if (areaName) {
    const areaResult = resolveAreas(areas, areaName);
    if (areaResult.status === "none") {
      return toolError("area_not_found", {
        area: areaName,
        message: `No Home Assistant area named ${areaName} was found.`,
      });
    }
    if (areaResult.status === "ambiguous") {
      return toolError("ambiguous_area", {
        candidates: areaResult.matches.map((area) => ({
          area_id: area.area_id,
          name: area.name,
        })),
        message: `Several Home Assistant areas could match ${areaName}.`,
      });
    }
    nextArea = areaResult.area;
  }

  const currentName =
    registry.name?.trim() ||
    registry.original_name?.trim() ||
    entity.name ||
    registry.entity_id;
  const currentAreaId = registry.area_id ?? null;
  const currentAreaName =
    areas.find((area) => area.area_id === currentAreaId)?.name ??
    entity.area ??
    null;

  const changes: NonNullable<HaToolPayload["changes"]> = {};
  let nextAreaId: string | undefined;
  let nextAreaName: string | undefined;
  if (nextArea) {
    if (nextArea.area_id !== currentAreaId) {
      changes.area = { from: currentAreaName, to: nextArea.name };
      nextAreaId = nextArea.area_id;
      nextAreaName = nextArea.name;
    }
  }
  if (nextName && nextName !== currentName) {
    changes.name = { from: currentName, to: nextName };
  }

  const changed = Boolean(changes.area || changes.name);
  const entityName = currentName;
  const confirmParts: string[] = [];
  if (changes.area) {
    confirmParts.push(
      `move it from ${changes.area.from ?? "no area"} to ${changes.area.to}`,
    );
  }
  if (changes.name) {
    confirmParts.push(`rename it from ${changes.name.from} to ${changes.name.to}`);
  }
  return {
    changed,
    entityId: registry.entity_id,
    entityName,
    currentName,
    currentAreaId,
    currentAreaName,
    nextName: changes.name && nextName ? nextName : undefined,
    nextAreaId,
    nextAreaName,
    changes,
    noopMessage: !changed
      ? nextArea
        ? `${entityName} is already assigned to ${nextArea.name}.`
        : `${entityName} already has that name.`
      : "",
    confirmMessage: changed
      ? `I found ${entityName}. This will ${confirmParts.join(" and ")}. Shall I do that?`
      : "",
  };
}

async function resolveUpdateEntity(
  input: {
    entity_id?: string | string[];
    search?: string;
    query?: string;
  },
  signal?: AbortSignal,
): Promise<LiveEntities> {
  if (Array.isArray(input.entity_id)) {
    return {
      ok: false,
      payload: toolError("invalid_input", {
        message: "update_entity accepts a single entity_id",
      }),
    };
  }
  const rawId = input.entity_id?.trim() ?? "";
  if (rawId && validateEntityId(rawId)) {
    return resolveForLiveCall({ entity_id: rawId }, signal);
  }
  const lookup = rawId || input.search?.trim() || input.query?.trim() || "";
  if (!lookup) {
    return {
      ok: false,
      payload: toolError("invalid_input", { message: "entity_id or search is required" }),
    };
  }
  return resolveForLiveCall({ name: lookup }, signal);
}

async function applyPreparedUpdate(
  pending: PendingConfigurationAction,
  signal?: AbortSignal,
): Promise<HaToolPayload> {
  try {
    const updated = await updateEntityRegistry({
      entityId: pending.entityId,
      areaId: pending.nextAreaId,
      name: pending.nextName,
      signal,
    });
    invalidateDiscoveryCaches();
    await refreshHomeAssistantEntities(signal).catch(() => undefined);
    const changes: NonNullable<HaToolPayload["changes"]> = {};
    if (pending.nextAreaName) {
      changes.area = { from: pending.currentAreaName, to: pending.nextAreaName };
    }
    if (pending.nextName) {
      changes.name = { from: pending.currentName, to: pending.nextName };
    }
    return {
      success: true,
      ok: true,
      changed: true,
      entity_id: updated?.entity_id ?? pending.entityId,
      name: pending.nextName ?? pending.entityName,
      risk: "configuration",
      changes,
    };
  } catch (error) {
    return toUpdateError(error);
  }
}

function isPreparedUpdate(
  value: PreparedEntityUpdate | HaToolPayload,
): value is PreparedEntityUpdate {
  return "entityId" in value && "changed" in value && "confirmMessage" in value;
}

function candidateSummary(entity: CompactEntity): {
  entity_id: string;
  name: string;
  area?: string;
} {
  return {
    entity_id: entity.entity_id,
    name: entity.name,
    area: entity.area,
  };
}

function createConfirmationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `cfg-${Date.now()}-${Math.random()}`;
}

function withOk(payload: HaToolPayload): HaToolPayload {
  return { ...payload, ok: payload.success };
}

function toUpdateError(error: unknown): HaToolPayload {
  if (error instanceof HomeAssistantError) {
    if (error.code === "not_configured" || error.code === "timeout") {
      return toolError(error.code, { message: redactSecrets(error.message) });
    }
    return toolError("home_assistant_error", {
      message: redactSecrets(error.message) || "Home Assistant rejected the entity update.",
    });
  }
  if (error instanceof Error && error.name === "AbortError") {
    return toolError("timeout", { message: "Home Assistant request was cancelled" });
  }
  return toolError("home_assistant_error", {
    message: "Home Assistant rejected the entity update.",
  });
}

export function formatHomeAssistantCatalog(
  entities: CompactEntity[],
  areas: HaArea[] = [],
): string {
  const useful = entities.filter((entity) => !SKIP_CATALOG_DOMAINS.has(entity.domain));
  const lines = useful.slice(0, 120).map((entity) => {
    const area = entity.area ? ` [${entity.area}]` : "";
    return `- ${entity.name}${area}`;
  });
  const areaLines = [...areas]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((area) => `- ${area.name}`);
  return [
    "You can inspect and control the house through Home Assistant tools only. Home Assistant is the source of truth. Speak to the user with friendly device names only, never entity IDs. Area names are case-insensitive; treat kitchen and Kitchen as the same and never ask about capitalisation. For current device state, call home_assistant.get_state rather than guessing from this list or chat history. If several entities could match a request, ask which one using their friendly names. If the user says lights (plural), you may act on all matching lights. Never mention access tokens or internal APIs.",
    "Home Assistant areas (pass these names to update_entity; capitalisation does not matter):",
    ...(areaLines.length > 0 ? areaLines : ["- (none loaded)"]),
    "Discovered devices (friendly names and rooms; not live state):",
    ...lines,
  ].join("\n");
}

export const HOME_ASSISTANT_INSTRUCTIONS =
  "You can inspect and control the house through Home Assistant tools. Home Assistant is the source of truth. Always talk to the user with friendly names such as Hue Play 1, never entity IDs such as light.hue_play_1. You may use entity_id only as an internal tool argument. For moves and renames, pass the friendly name in search, not an entity_id. Area names are case-insensitive: kitchen, Kitchen, and KITCHEN are the same room. Never ask the user about capitalisation. Use home_assistant.get_areas to list rooms. Use home_assistant.get_entities to find devices; their name and area fields are what you should use. Use home_assistant.get_state for current state questions. Use home_assistant.call_service to turn devices on or off; that does not need confirmation. Use home_assistant.update_entity only to move a device to an area or rename it. Pass the area name, never an area_id. If update_entity returns pending_confirmation, explain the change in plain language using friendly names and ask the user to confirm. Do not claim a move or rename happened unless the tool result says changed: true. If several devices or rooms could match, ask which one by friendly name. Never mention access tokens or internal APIs.";
