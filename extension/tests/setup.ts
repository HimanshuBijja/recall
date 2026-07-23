// Minimal chrome global stub so modules that touch chrome.* at import time
// (none currently do) or in tests that don't provide their own stub still
// have something safe to call.
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    sync: { get: async () => ({}), set: async () => {} },
    local: { get: async () => ({}), set: async () => {} },
    onChanged: { addListener: () => {} },
  },
  runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => ({}) },
  alarms: { create: () => {}, onAlarm: { addListener: () => {} }, clear: async () => {} },
  tabs: { query: async () => [], create: async () => {} },
  action: { onClicked: { addListener: () => {} } },
} as never;
