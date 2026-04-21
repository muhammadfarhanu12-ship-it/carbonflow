const CACHE_STORE = new Map();

function getNow() {
  return Date.now();
}

function get(key) {
  const cached = CACHE_STORE.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= getNow()) {
    CACHE_STORE.delete(key);
    return null;
  }

  return cached.value;
}

function set(key, value, ttlMs = 60000) {
  CACHE_STORE.set(key, {
    value,
    expiresAt: getNow() + ttlMs,
  });

  return value;
}

async function remember(key, ttlMs, producer) {
  const cached = get(key);

  if (cached !== null) {
    return cached;
  }

  const value = await producer();
  return set(key, value, ttlMs);
}

function remove(key) {
  CACHE_STORE.delete(key);
}

function removeByPrefix(prefix) {
  for (const key of CACHE_STORE.keys()) {
    if (key.startsWith(prefix)) {
      CACHE_STORE.delete(key);
    }
  }
}

function clear() {
  CACHE_STORE.clear();
}

module.exports = {
  get,
  set,
  remember,
  remove,
  removeByPrefix,
  clear,
};
