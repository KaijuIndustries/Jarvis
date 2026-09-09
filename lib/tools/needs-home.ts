/**
 * Conservative heuristic: inject a compact Home Assistant catalog when
 * the user likely wants house control or device state.
 */
const NEEDS_HOME =
  /\b(light|lights|lamp|lamps|switch|switches|socket|plug|thermostat|temperature|heating|heat|cooling|climate|scene|scenes|garage|door|lock|fan|heater|air.?con|air.?conditioning|hue|meross|daikin|brightness|dim|home assistant|downstairs|upstairs|hallway|kitchen|bedroom|living room|lounge|turn (it |them |the .+ )?(on|off)|switch (it |them |the .+ )?(on|off)|set .+ to \d+\s*(%|percent)|is (the |my )?.+ (on|off|open|closed|locked)|what lights|which lights)\b/i;

export function queryNeedsHomeAssistant(text: string): boolean {
  const value = text.trim();
  if (value.length < 4) return false;
  return NEEDS_HOME.test(value);
}
