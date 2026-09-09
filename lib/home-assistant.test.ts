import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  actionRisk,
  checkHomeAssistantAuth,
  executeCallService,
  executeGetEntities,
  executeGetState,
  redactSecrets,
  resetHomeAssistantCacheForTests,
  resolveEntities,
  setHomeAssistantFetchForTests,
  validateEntityId,
  validateServiceData,
  type CompactEntity,
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
  return jsonResponse({ message: "not found" }, 404);
};

beforeEach(() => {
  process.env.HOME_ASSISTANT_URL = BASE;
  process.env.HOME_ASSISTANT_TOKEN = TOKEN;
  requests = [];
  serviceNotFoundOnce = new Set();
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
  const result = await executeGetEntities({ domain: "light", search: "living" });
  assert.equal(result.success, true);
  const entities = result.entities as Array<Record<string, unknown>>;
  assert.equal(entities.length, 1);
  assert.equal(entities[0]?.entity_id, "light.living_room");
  assert.equal(entities[0]?.name, "Living Room Light");
  assert.equal(entities[0]?.domain, "light");
  assert.ok(!JSON.stringify(result).includes("context"));
  assertNoSecretLeak(result);
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
});
