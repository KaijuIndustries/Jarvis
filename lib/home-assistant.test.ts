import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  actionRisk,
  checkHomeAssistantAuth,
  executeCallService,
  executeGetAreas,
  executeGetEntities,
  executeGetState,
  executeUpdateEntity,
  formatHomeAssistantCatalog,
  HomeAssistantError,
  getHomeAssistantCatalogStatus,
  getPendingConfigurationById,
  isAffirmativeConfirmation,
  peekPendingConfiguration,
  PENDING_CONFIGURATION_TTL_MS,
  redactSecrets,
  refreshHomeAssistantCatalog,
  resetHomeAssistantCacheForTests,
  resolveAreas,
  resolveEntities,
  settlePendingConfiguration,
  setHomeAssistantFetchForTests,
  validateEntityId,
  validateEntityName,
  validateServiceData,
  type CompactEntity,
  type HaArea,
} from "./home-assistant.ts";

const TOKEN = "super-secret-ha-token-xyz";
const BASE = "http://192.168.1.80";
const SECRET_HEADER = `Bearer ${TOKEN}`;

const kitchenLight: CompactEntity = {
  entity_id: "light.kitchen",
  name: "Kitchen Light",
  domain: "light",
  state: "on",
};

const kitchenPendant: CompactEntity = {
  entity_id: "light.kitchen_pendant",
  name: "Kitchen Pendant",
  domain: "light",
  state: "off",
};

const kitchenCabinet: CompactEntity = {
  entity_id: "light.kitchen_under_cabinet",
  name: "Kitchen Under Cabinet",
  domain: "light",
  state: "on",
};

const livingRoom: CompactEntity = {
  entity_id: "light.living_room",
  name: "Living Room Light",
  domain: "light",
  state: "on",
};

type RecordedRequest = {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
};

const previousUrl = process.env.HOME_ASSISTANT_URL;
const previousToken = process.env.HOME_ASSISTANT_TOKEN;
let requests: RecordedRequest[] = [];
let states: Record<string, ReturnType<typeof haState>>;
let areas: HaArea[] = [];
let registry: Record<
  string,
  {
    entity_id: string;
    name: string | null;
    original_name: string;
    area_id: string | null;
  }
> = {};
let registryMissingOnce = new Set<string>();
let updateReject = false;
let updateMalformed = false;
let serviceNotFoundOnce = new Set<string>();
let logs: string[] = [];
let restoreConsole: (() => void) | null = null;

function haState(
  entityId: string,
  name: string,
  state: string,
  extra: Record<string, unknown> = {},
) {
  return {
    entity_id: entityId,
    state,
    attributes: { friendly_name: name, ...extra },
    last_changed: "2026-09-09T20:00:00.000Z",
    last_updated: "2026-09-09T20:00:00.000Z",
  };
}

function seedDefaultStates() {
  states = {
    "light.kitchen": haState("light.kitchen", "Kitchen Light", "on", {
      brightness: 128,
    }),
    "light.kitchen_pendant": haState(
      "light.kitchen_pendant",
      "Kitchen Pendant",
      "off",
    ),
    "light.kitchen_under_cabinet": haState(
      "light.kitchen_under_cabinet",
      "Kitchen Under Cabinet",
      "on",
    ),
    "light.living_room": haState("light.living_room", "Living Room Light", "on"),
    "light.hue_play_1": haState("light.hue_play_1", "Hue Play 1", "on"),
    "light.hue_play_1_light": haState("light.hue_play_1_light", "Hue Play 1 Light", "off"),
  };
  areas = [
    { area_id: "kitchen", name: "Kitchen" },
    { area_id: "living_room", name: "Living Room" },
    { area_id: "lounge", name: "Lounge" },
  ];
  registry = {
    "light.hue_play_1": {
      entity_id: "light.hue_play_1",
      name: null,
      original_name: "Hue Play 1",
      area_id: "living_room",
    },
    "light.hue_play_1_light": {
      entity_id: "light.hue_play_1_light",
      name: null,
      original_name: "Hue Play 1 Light",
      area_id: "bedroom",
    },
    "light.living_room": {
      entity_id: "light.living_room",
      name: null,
      original_name: "Living Room Light",
      area_id: "living_room",
    },
    "light.kitchen": {
      entity_id: "light.kitchen",
      name: null,
      original_name: "Kitchen Light",
      area_id: "kitchen",
    },
    "light.kitchen_pendant": {
      entity_id: "light.kitchen_pendant",
      name: null,
      original_name: "Kitchen Pendant",
      area_id: "kitchen",
    },
    "light.kitchen_under_cabinet": {
      entity_id: "light.kitchen_under_cabinet",
      name: null,
      original_name: "Kitchen Under Cabinet",
      area_id: "kitchen",
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function captureLogs() {
  logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const record = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
  console.log = record;
  console.error = record;
  console.info = record;
  console.warn = record;
  restoreConsole = () => {
    console.log = originalLog;
    console.error = originalError;
    console.info = originalInfo;
    console.warn = originalWarn;
  };
}

function assertNoSecretLeak(value: unknown) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /super-secret-ha-token-xyz/);
  assert.doesNotMatch(text, /Bearer (?!\[redacted\])/);
  for (const line of logs) {
    assert.doesNotMatch(line, /super-secret-ha-token-xyz/);
  }
}

const mockFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const authorization = headers.get("Authorization");
  let body: unknown = undefined;
  if (typeof init?.body === "string" && init.body) {
    body = JSON.parse(init.body);
  }
  requests.push({ url, method, authorization, body });

  if (url === `${BASE}/api/` && method === "GET") {
    return jsonResponse({ message: "API running." });
  }
  if (url === `${BASE}/api/states` && method === "GET") {
    return jsonResponse(Object.values(states));
  }
  const stateMatch = url.match(/\/api\/states\/([^/?]+)$/);
  if (stateMatch && method === "GET") {
    const entityId = decodeURIComponent(stateMatch[1] ?? "");
    const state = states[entityId];
    if (!state) {
      return jsonResponse({ message: "Entity not found." }, 404);
    }
    return jsonResponse(state);
  }
  const serviceMatch = url.match(/\/api\/services\/([^/]+)\/([^/?]+)$/);
  if (serviceMatch && method === "POST") {
    const domain = decodeURIComponent(serviceMatch[1] ?? "");
    const service = decodeURIComponent(serviceMatch[2] ?? "");
    const payload = (body ?? {}) as { entity_id?: string | string[] };
    const ids = Array.isArray(payload.entity_id)
      ? payload.entity_id
      : payload.entity_id
        ? [payload.entity_id]
        : [];
    for (const id of ids) {
      const key = `${domain}.${service}:${id}`;
      if (serviceNotFoundOnce.has(key)) {
        serviceNotFoundOnce.delete(key);
        return jsonResponse({ message: `Entity ${id} not found.` }, 404);
      }
      if (!states[id]) {
        return jsonResponse({ message: `Entity ${id} not found.` }, 404);
      }
      const nextState = service === "turn_off" ? "off" : "on";
      states[id] = {
        ...states[id],
        state: nextState,
      };
    }
    return jsonResponse(ids.map((id) => states[id]));
  }
  if (url === `${BASE}/api/config/area_registry/list` && method === "GET") {
    return jsonResponse(areas);
  }
  if (url === `${BASE}/api/config/entity_registry/list` && method === "GET") {
    return jsonResponse(Object.values(registry));
  }
  const registryMatch = url.match(/\/api\/config\/entity_registry\/([^/?]+)$/);
  if (registryMatch && method === "GET") {
    const entityId = decodeURIComponent(registryMatch[1] ?? "");
    if (entityId === "update") {
      return jsonResponse({ message: "not found" }, 404);
    }
    if (registryMissingOnce.has(entityId)) {
      registryMissingOnce.delete(entityId);
      return jsonResponse({ message: "Entity not found." }, 404);
    }
    const entry = registry[entityId];
    if (!entry) return jsonResponse({ message: "Entity not found." }, 404);
    return jsonResponse(entry);
  }
  if (url === `${BASE}/api/config/entity_registry/update` && method === "POST") {
    if (updateReject) {
      return jsonResponse({ message: `Rejected token ${TOKEN}` }, 400);
    }
    if (updateMalformed) {
      return jsonResponse({ not: "an entity" });
    }
    const payload = (body ?? {}) as {
      entity_id?: string;
      area_id?: string | null;
      name?: string;
    };
    const entityId = payload.entity_id ?? "";
    const current = registry[entityId];
    if (!current) return jsonResponse({ message: "Entity not found." }, 404);
    const extraKeys = Object.keys(payload).filter(
      (key) => !["entity_id", "area_id", "name"].includes(key),
    );
    if (extraKeys.length > 0) {
      return jsonResponse({ message: "unsupported field" }, 400);
    }
    registry[entityId] = {
      ...current,
      area_id: payload.area_id === undefined ? current.area_id : payload.area_id,
      name: payload.name === undefined ? current.name : payload.name,
    };
    return jsonResponse(registry[entityId]);
  }
  return jsonResponse({ message: "not found" }, 404);
};

beforeEach(() => {
  process.env.HOME_ASSISTANT_URL = BASE;
  process.env.HOME_ASSISTANT_TOKEN = TOKEN;
  requests = [];
  serviceNotFoundOnce = new Set();
  registryMissingOnce = new Set();
  updateReject = false;
  updateMalformed = false;
  seedDefaultStates();
  resetHomeAssistantCacheForTests();
  setHomeAssistantFetchForTests(mockFetch);
  captureLogs();
});

afterEach(() => {
  restoreConsole?.();
  restoreConsole = null;
  setHomeAssistantFetchForTests(null);
  resetHomeAssistantCacheForTests();
  if (previousUrl === undefined) delete process.env.HOME_ASSISTANT_URL;
  else process.env.HOME_ASSISTANT_URL = previousUrl;
  if (previousToken === undefined) delete process.env.HOME_ASSISTANT_TOKEN;
  else process.env.HOME_ASSISTANT_TOKEN = previousToken;
});

test("authenticates to Home Assistant with a bearer token and never logs it", async () => {
  const result = await checkHomeAssistantAuth();
  assert.equal(result.ok, true);
  assert.equal(requests[0]?.authorization, SECRET_HEADER);
  assertNoSecretLeak(result);
});

test("get_entities returns a compact discovery list", async () => {
  const result = await executeGetEntities({ domain: "light", search: "living room light" });
  assert.equal(result.success, true);
  const entities = result.entities as Array<Record<string, unknown>>;
  assert.equal(entities.length, 1);
  assert.equal(entities[0]?.entity_id, "light.living_room");
  assert.equal(entities[0]?.name, "Living Room Light");
  assert.equal(entities[0]?.domain, "light");
  assert.equal(entities[0]?.area, "Living Room");
  assert.ok(!JSON.stringify(result).includes("context"));
  assertNoSecretLeak(result);
});

test("get_entities joins registry areas so room filters work", async () => {
  const kitchen = await executeGetEntities({ domain: "light", area: "Kitchen" });
  assert.equal(kitchen.success, true);
  const kitchenIds = (kitchen.entities as Array<{ entity_id?: string }>).map(
    (entity) => entity.entity_id,
  );
  assert.deepEqual(kitchenIds.sort(), [
    "light.kitchen",
    "light.kitchen_pendant",
    "light.kitchen_under_cabinet",
  ]);
  const living = await executeGetEntities({ domain: "light", area: "Living Room" });
  const livingIds = (living.entities as Array<{ entity_id?: string }>).map(
    (entity) => entity.entity_id,
  );
  assert.ok(livingIds.includes("light.hue_play_1"));
  assert.ok(livingIds.includes("light.living_room"));
});

test("get_areas lists Home Assistant rooms by name", async () => {
  const result = await executeGetAreas();
  assert.equal(result.success, true);
  assert.equal(result.count, 3);
  const names = (result.areas as Array<{ name?: string; area_id?: string }>).map(
    (area) => area.name,
  );
  assert.deepEqual(names.sort(), ["Kitchen", "Living Room", "Lounge"]);
  assert.ok(
    (result.areas as Array<{ area_id?: string }>).every((area) => typeof area.area_id === "string"),
  );
  assertNoSecretLeak(result);
});

test("catalogue prompt includes area names and joined entity rooms", () => {
  const text = formatHomeAssistantCatalog(
    [
      {
        entity_id: "light.hue_play_1",
        name: "Hue Play 1",
        domain: "light",
        state: "on",
        area: "Living Room",
      },
    ],
    [{ area_id: "living_room", name: "Living Room" }],
  );
  assert.match(text, /Living Room/);
  assert.match(text, /Hue Play 1/);
  assert.match(text, /\[Living Room\]/);
  assert.doesNotMatch(text, /living_room/);
});

test("get_state reads live state from Home Assistant", async () => {
  const result = await executeGetState({ entity_id: "light.living_room" });
  assert.equal(result.success, true);
  assert.equal(result.entity_id, "light.living_room");
  assert.equal(result.entity_name, "Living Room Light");
  assert.equal(result.state, "on");
  assert.ok(requests.some((request) => request.url.endsWith("/api/states/light.living_room")));
  assertNoSecretLeak(result);
});

test("call_service turns a light off and returns the resulting state", async () => {
  const result = await executeCallService({
    domain: "light",
    service: "turn_off",
    entity_id: "light.living_room",
  });
  assert.equal(result.success, true);
  assert.equal(result.entity_id, "light.living_room");
  assert.equal(result.action, "light.turn_off");
  assert.equal(result.state, "off");
  const posted = requests.find((request) => request.method === "POST");
  assert.deepEqual(posted?.body, { entity_id: "light.living_room" });
  assertNoSecretLeak(result);
});

test("unknown entity returns entity_not_found after one discovery refresh", async () => {
  const result = await executeCallService({
    domain: "light",
    service: "turn_off",
    entity_id: "light.workshop",
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "entity_not_found");
  assert.equal(result.entity_id, "light.workshop");
  assert.ok(requests.some((request) => request.url === `${BASE}/api/states`));
  assert.equal(
    requests.filter((request) => request.method === "POST").length,
    1,
  );
  assertNoSecretLeak(result);
});

test("unknown entity refreshes discovery and retries the service once", async () => {
  serviceNotFoundOnce.add("light.turn_on:light.hallway");
  states["light.hallway"] = haState("light.hallway", "Hallway Light", "off");
  const result = await executeCallService({
    domain: "light",
    service: "turn_on",
    entity_id: "light.hallway",
  });
  assert.equal(result.success, true);
  assert.equal(result.entity_id, "light.hallway");
  assert.equal(result.state, "on");
  assert.equal(
    requests.filter((request) => request.method === "POST").length,
    2,
  );
  assert.ok(requests.some((request) => request.url === `${BASE}/api/states`));
  assertNoSecretLeak(result);
});

test("ambiguous kitchen lights are not chosen at random", async () => {
  await executeGetEntities({});
  const result = await executeCallService({
    domain: "light",
    service: "turn_off",
    name: "kitchen light",
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "ambiguous_entity");
  const matches = result.matches as Array<{ entity_id: string; name: string }>;
  assert.ok(matches.some((match) => match.entity_id === "light.kitchen"));
  assert.ok(matches.some((match) => match.entity_id === "light.kitchen_pendant"));
  assert.ok(
    matches.some((match) => match.entity_id === "light.kitchen_under_cabinet"),
  );
  assert.equal(requests.filter((request) => request.method === "POST").length, 0);
  assertNoSecretLeak(result);
});

test("plural lights may resolve to every matching kitchen light", () => {
  const resolved = resolveEntities(
    [kitchenLight, kitchenPendant, kitchenCabinet, livingRoom],
    { name: "kitchen lights" },
  );
  assert.equal(resolved.status, "resolved");
  if (resolved.status === "resolved") {
    assert.equal(resolved.entities.length, 3);
  }
});

test("Home Assistant HTTP errors are structured and redacted", async () => {
  setHomeAssistantFetchForTests(async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      authorization: headers.get("Authorization"),
      body: undefined,
    });
    return jsonResponse(
      { message: `Rejected token ${TOKEN} Bearer ${TOKEN}` },
      400,
    );
  });
  const result = await executeGetState({ entity_id: "light.living_room" });
  assert.equal(result.success, false);
  assert.equal(result.error, "http_error");
  assert.equal(result.message, "Rejected token [redacted] Bearer [redacted]");
  assertNoSecretLeak(result);
});

test("missing Home Assistant configuration returns not_configured", async () => {
  delete process.env.HOME_ASSISTANT_URL;
  delete process.env.HOME_ASSISTANT_TOKEN;
  const result = await executeGetEntities({});
  assert.equal(result.success, false);
  assert.equal(result.error, "not_configured");
  assert.equal(requests.length, 0);
  assertNoSecretLeak(result);
});

test("invalid entity ids and service data are rejected before calling Home Assistant", async () => {
  assert.equal(validateEntityId("not an id"), null);
  assert.equal(validateEntityId("../etc/passwd"), null);
  assert.equal(validateServiceData({ url: "http://evil.example" }).ok, false);
  assert.equal(validateServiceData({ token: "abc" }).ok, false);
  const result = await executeCallService({
    domain: "light",
    service: "turn_on",
    entity_id: "http://evil.example",
    service_data: { brightness_pct: 30 },
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "invalid_input");
  assert.equal(requests.length, 0);
});

test("redactSecrets strips bearer tokens from error text", () => {
  assert.equal(
    redactSecrets(`Authorization: Bearer ${TOKEN} failed`),
    "Authorization: Bearer [redacted] failed",
  );
});

test("high-risk actions are marked without blocking ordinary lights", () => {
  assert.equal(actionRisk("light", "turn_off"), "normal");
  assert.equal(actionRisk("lock", "unlock"), "high");
  assert.equal(actionRisk("home_assistant", "update_entity"), "configuration");
});

test("resolves Home Assistant areas case-insensitively and trims whitespace", () => {
  const kitchen = { area_id: "kitchen", name: "Kitchen" };
  const lounge = { area_id: "lounge", name: "Lounge" };
  assert.equal(resolveAreas([kitchen, lounge], " kitchen ").status, "resolved");
  assert.equal(resolveAreas([kitchen, lounge], "KITCHEN").status, "resolved");
  assert.equal(resolveAreas([kitchen, lounge], "Upstairs").status, "none");
  assert.equal(
    resolveAreas(
      [
        { area_id: "kitchen", name: "Kitchen" },
        { area_id: "kitchen_2", name: "Kitchen" },
      ],
      "Kitchen",
    ).status,
    "ambiguous",
  );
});

test("update_entity previews an area move and does not write until confirmed", async () => {
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  assert.equal(preview.ok, true);
  assert.equal(preview.pending_confirmation, true);
  assert.equal(preview.risk, "configuration");
  assert.deepEqual(preview.changes, {
    area: { from: "Living Room", to: "Kitchen" },
  });
  assert.equal(
    requests.some((request) => request.url.endsWith("/entity_registry/update")),
    false,
  );
  const pending = peekPendingConfiguration("convo-1");
  assert.ok(pending);
  assert.equal(pending?.entityId, "light.hue_play_1");
  assert.equal(pending?.nextAreaName, "Kitchen");
  assertNoSecretLeak(preview);
});

test("confirmed update_entity moves an entity and can only run once", async () => {
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  const confirmed = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview.confirmation_id) },
    { conversationId: "convo-1", requestId: "req-2" },
  );
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.changed, true);
  assert.deepEqual(confirmed.changes, {
    area: { from: "Living Room", to: "Kitchen" },
  });
  assert.equal(registry["light.hue_play_1"]?.area_id, "kitchen");
  const again = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview.confirmation_id) },
    { conversationId: "convo-1", requestId: "req-3" },
  );
  assert.equal(again.ok, false);
  assert.equal(again.error, "confirmation_required");
  assert.equal(peekPendingConfiguration("convo-1"), null);
  assertNoSecretLeak(confirmed);
});

test("same-request confirmation cannot execute a pending configuration change", async () => {
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  const blocked = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview.confirmation_id) },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  assert.equal(blocked.error, "confirmation_required");
  assert.equal(registry["light.hue_play_1"]?.area_id, "living_room");
});

test("unrelated conversation confirmation cannot execute a pending action", async () => {
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  const other = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview.confirmation_id) },
    { conversationId: "convo-2", requestId: "req-2" },
  );
  assert.equal(other.error, "confirmation_required");
  assert.equal(registry["light.hue_play_1"]?.area_id, "living_room");
});

test("expired confirmation cannot execute", async () => {
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1", now: 1_000 },
  );
  assert.equal(preview.pending_confirmation, true);
  const expired = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview.confirmation_id) },
    {
      conversationId: "convo-1",
      requestId: "req-2",
      now: 1_000 + PENDING_CONFIGURATION_TTL_MS + 1,
    },
  );
  assert.equal(expired.error, "confirmation_required");
  assert.equal(getPendingConfigurationById(String(preview.confirmation_id)), null);
});

test("settling an unrelated user message cancels a pending configuration action", async () => {
  await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  const settled = await settlePendingConfiguration("convo-1", "what time is it?");
  assert.equal(settled.kind, "none");
  assert.equal(peekPendingConfiguration("convo-1"), null);
  assert.equal(isAffirmativeConfirmation("yes please"), true);
});

test("settlePendingConfiguration executes a matching yes once", async () => {
  await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  const settled = await settlePendingConfiguration("convo-1", "Yes.", {
    requestId: "req-2",
  });
  assert.equal(settled.kind, "executed");
  if (settled.kind === "executed") {
    assert.equal(settled.payload.changed, true);
  }
  assert.equal(registry["light.hue_play_1"]?.area_id, "kitchen");
});

test("update_entity renames and can update both fields after confirmation", async () => {
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen", name: "Kitchen Lamp" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  assert.equal(preview.pending_confirmation, true);
  assert.deepEqual(preview.changes?.name, {
    from: "Hue Play 1",
    to: "Kitchen Lamp",
  });
  const confirmed = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview.confirmation_id) },
    { conversationId: "convo-1", requestId: "req-2" },
  );
  assert.equal(confirmed.changed, true);
  assert.equal(registry["light.hue_play_1"]?.name, "Kitchen Lamp");
  assert.equal(registry["light.hue_play_1"]?.area_id, "kitchen");
});

test("update_entity is a no-op when the entity is already in that area", async () => {
  registry["light.hue_play_1"].area_id = "kitchen";
  const result = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.pending_confirmation, undefined);
  assert.match(String(result.message), /already assigned to Kitchen/);
  assert.equal(
    requests.some((request) => request.url.endsWith("/entity_registry/update")),
    false,
  );
});

test("update_entity returns area_not_found and ambiguous_area without guessing", async () => {
  const missing = await executeUpdateEntity({
    entity_id: "light.hue_play_1",
    area: "Upstairs",
  });
  assert.equal(missing.error, "area_not_found");
  areas.push({ area_id: "kitchen_2", name: "Kitchen" });
  const ambiguous = await executeUpdateEntity({
    entity_id: "light.hue_play_1",
    area: "Kitchen",
  });
  assert.equal(ambiguous.error, "ambiguous_area");
  assert.ok(Array.isArray(ambiguous.candidates));
});

test("update_entity returns ambiguous_entity when two Hue Play 1 names match", async () => {
  states["light.hue_play_1_light"] = haState(
    "light.hue_play_1_light",
    "Hue Play 1",
    "off",
  );
  const result = await executeUpdateEntity({
    search: "Hue Play 1",
    area: "Kitchen",
  });
  assert.equal(result.error, "ambiguous_entity");
  const candidates = result.candidates ?? [];
  assert.ok(candidates.some((item) => item.entity_id === "light.hue_play_1"));
  assert.ok(candidates.some((item) => item.entity_id === "light.hue_play_1_light"));
});

test("update_entity refreshes once for an unknown entity then still returns entity_not_found", async () => {
  const result = await executeUpdateEntity({
    entity_id: "light.workshop",
    area: "Kitchen",
  });
  assert.equal(result.error, "entity_not_found");
  assert.ok(requests.some((request) => request.url.endsWith("/api/states")));
});

test("update_entity retries registry lookup once after an unknown entity", async () => {
  registryMissingOnce.add("light.hue_play_1");
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1" },
  );
  assert.equal(preview.pending_confirmation, true);
  assert.equal(
    requests.filter((request) =>
      request.url.includes("/config/entity_registry/light.hue_play_1"),
    ).length,
    2,
  );
});

test("update_entity rejects empty names, missing fields, URLs, and supplied area_id", async () => {
  assert.equal(validateEntityName(""), null);
  assert.equal(validateEntityName("http://evil.example"), null);
  const missing = await executeUpdateEntity({ entity_id: "light.hue_play_1" });
  assert.equal(missing.error, "invalid_input");
  const emptyName = await executeUpdateEntity({
    entity_id: "light.hue_play_1",
    name: "   ",
  });
  assert.equal(emptyName.error, "invalid_input");
  const injected = await executeUpdateEntity({
    entity_id: "light.hue_play_1",
    area: "Kitchen",
    unsupported_fields: ["area_id", "url"],
  });
  assert.equal(injected.error, "invalid_input");
  assert.equal(
    requests.some((request) => request.url.endsWith("/entity_registry/update")),
    false,
  );
});

test("update_entity maps Home Assistant rejection, malformed responses, and timeouts", async () => {
  updateReject = true;
  const preview = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  let failed = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview.confirmation_id) },
    { conversationId: "convo-1", requestId: "req-2" },
  );
  assert.equal(failed.error, "home_assistant_error");
  assertNoSecretLeak(failed);
  updateReject = false;

  const preview2 = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-2", requestId: "req-3" },
  );
  updateMalformed = true;
  failed = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview2.confirmation_id) },
    { conversationId: "convo-2", requestId: "req-4" },
  );
  assert.equal(failed.error, "home_assistant_error");

  const preview3 = await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-3", requestId: "req-5" },
  );
  setHomeAssistantFetchForTests(async () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  });
  failed = await executeUpdateEntity(
    { confirm: true, confirmation_id: String(preview3.confirmation_id) },
    { conversationId: "convo-3", requestId: "req-6" },
  );
  assert.equal(failed.error, "timeout");
});

test("manual catalogue refresh fails closed when Home Assistant is not configured", async () => {
  delete process.env.HOME_ASSISTANT_URL;
  delete process.env.HOME_ASSISTANT_TOKEN;
  await assert.rejects(
    () => refreshHomeAssistantCatalog(),
    (error: unknown) =>
      error instanceof HomeAssistantError && error.code === "not_configured",
  );
  assert.equal(getHomeAssistantCatalogStatus().configured, false);
});

test("manual catalogue refresh replaces the cached entities and areas", async () => {
  const empty = getHomeAssistantCatalogStatus();
  assert.equal(empty.configured, true);
  assert.equal(empty.entityCount, null);
  assert.equal(empty.areaCount, null);

  const first = await refreshHomeAssistantCatalog();
  assert.equal(first.configured, true);
  assert.equal(first.entityCount, 6);
  assert.equal(first.areaCount, 3);
  assert.equal(typeof first.refreshedAt, "number");
  assert.equal(getHomeAssistantCatalogStatus().entityCount, 6);

  states["light.office"] = haState("light.office", "Office Light", "off");
  areas.push({ area_id: "office", name: "Office" });
  registry["light.office"] = {
    entity_id: "light.office",
    name: null,
    original_name: "Office Light",
    area_id: "office",
  };

  const stale = await executeGetEntities({});
  const staleIds = (stale.entities as Array<{ entity_id?: string }>).map(
    (entity) => entity.entity_id,
  );
  assert.equal(staleIds.includes("light.office"), false);
  assert.equal(getHomeAssistantCatalogStatus().entityCount, 6);
  assert.equal(getHomeAssistantCatalogStatus().areaCount, 3);

  const refreshed = await refreshHomeAssistantCatalog();
  assert.equal(refreshed.entityCount, 7);
  assert.equal(refreshed.areaCount, 4);
  const live = await executeGetEntities({ domain: "light", search: "office" });
  assert.equal(live.success, true);
  assert.equal((live.entities as Array<{ entity_id?: string; area?: string }>)[0]?.entity_id, "light.office");
  assert.equal((live.entities as Array<{ area?: string }>)[0]?.area, "Office");
  assertNoSecretLeak(refreshed);
});

test("ordinary call_service is unaffected by a pending configuration action", async () => {
  await executeUpdateEntity(
    { entity_id: "light.hue_play_1", area: "Kitchen" },
    { conversationId: "convo-1", requestId: "req-1" },
  );
  const result = await executeCallService({
    domain: "light",
    service: "turn_off",
    entity_id: "light.living_room",
  });
  assert.equal(result.success, true);
  assert.equal(result.state, "off");
  assert.equal(peekPendingConfiguration("convo-1")?.entityId, "light.hue_play_1");
});
