// Persistent storage for settings and save games: a small wrapper over localStorage that
// namespaces its keys, stamps every record with a version and migrates old records forward,
// refuses records that are too large, and never throws. When the browser offers no storage
// (private windows, blocked site data) it keeps the data in memory so the game still plays.
//
//   const storage = createPersistentStorage({ namespace: 'marazul' });
//   storage.write('save.slot1', saveData, { version: 3 });
//   const { ok, data } = storage.read('save.slot1', {
//     version: 3,
//     migrations: { 1: (old) => ({ ...old, cash: old.money }), 2: (old) => ({ ...old, rank: 0 }) },
//   });

/**
 * @typedef {Object} StorageBackend The part of the Web Storage interface that is used.
 * @property {(key: string) => (string | null)} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 * @property {(index: number) => (string | null)} key
 * @property {number} length
 */

/**
 * @typedef {Object} StorageReadResult
 * @property {boolean} ok True when a record was found, understood and brought to the version asked for.
 * @property {any} data The record's data, or the fallback.
 * @property {number} version The version the record was stored with (0 when there was none).
 * @property {boolean} migrated True when migrations ran.
 * @property {string} reason '' when ok; otherwise 'missing', 'corrupt', 'newer version',
 *   'no migration from version N' or 'migration from version N failed: ...'.
 */

/**
 * Creates the storage wrapper.
 * @param {Object} [options]
 * @param {string} [options.namespace] Prefix of every key; default 'marazul'.
 * @param {StorageBackend | null} [options.backend] The store; default window.localStorage when
 *   it works, otherwise memory.
 * @param {number} [options.maxRecordBytes] Largest record accepted by write(); default 1 MiB.
 * @returns {ReturnType<typeof buildPersistentStorage>}
 */
export function createPersistentStorage(options = {}) {
  return buildPersistentStorage(options);
}

function buildPersistentStorage(options) {
  const prefix = `${options.namespace ?? 'marazul'}:`;
  const maxRecordBytes = options.maxRecordBytes ?? 1024 * 1024;
  const real = options.backend === undefined ? findWorkingLocalStorage() : options.backend;
  const backend = real ?? createMemoryBackend();

  const storage = {
    /** False when the data only lives in memory and will be gone when the page closes. */
    persistent: real !== null,
    write,
    read,
    remove,
    has,
    keys,
    bytesUsed,
    clear,
  };

  /**
   * Stores a record.
   * @param {string} key The record's name within the namespace.
   * @param {any} data JSON-serialisable data.
   * @param {{version?: number}} [writeOptions] The data's format version; default 1.
   * @returns {{ok: boolean, bytes: number, reason: string}} reason is '' when ok, otherwise
   *   'not serialisable', 'too large' or 'storage refused'.
   */
  function write(key, data, writeOptions = {}) {
    let text;
    try {
      text = JSON.stringify({ v: writeOptions.version ?? 1, d: data });
    } catch {
      return { ok: false, bytes: 0, reason: 'not serialisable' };
    }
    if (text === undefined) return { ok: false, bytes: 0, reason: 'not serialisable' };
    const bytes = storedBytes(prefix + key, text);
    if (bytes > maxRecordBytes) return { ok: false, bytes, reason: 'too large' };
    try {
      backend.setItem(prefix + key, text);
    } catch {
      return { ok: false, bytes, reason: 'storage refused' };
    }
    return { ok: true, bytes, reason: '' };
  }

  /**
   * Reads a record and migrates it to the version asked for.
   * @param {string} key The record's name within the namespace.
   * @param {Object} [readOptions]
   * @param {number} [readOptions.version] The version the caller understands; default: accept
   *   whatever is stored.
   * @param {Record<number, (data: any) => any>} [readOptions.migrations] For each old version N,
   *   a function that turns version N data into version N + 1 data.
   * @param {any} [readOptions.fallback] Returned as data when the read fails; default null.
   * @returns {StorageReadResult}
   */
  function read(key, readOptions = {}) {
    const fallback = readOptions.fallback ?? null;
    const failure = (reason, version = 0) => ({ ok: false, data: fallback, version, migrated: false, reason });
    let text;
    try {
      text = backend.getItem(prefix + key);
    } catch {
      return failure('missing');
    }
    if (text === null || text === undefined) return failure('missing');
    let record;
    try {
      record = JSON.parse(text);
    } catch {
      return failure('corrupt');
    }
    if (record === null || typeof record !== 'object' || typeof record.v !== 'number' || !('d' in record)) {
      return failure('corrupt');
    }
    const wanted = readOptions.version;
    let data = record.d;
    let version = record.v;
    if (wanted === undefined || version === wanted) {
      return { ok: true, data, version: record.v, migrated: false, reason: '' };
    }
    if (version > wanted) return failure('newer version', record.v);
    while (version < wanted) {
      const migrate = readOptions.migrations?.[version];
      if (!migrate) return failure(`no migration from version ${version}`, record.v);
      try {
        data = migrate(data);
      } catch (error) {
        return failure(`migration from version ${version} failed: ${error instanceof Error ? error.message : error}`, record.v);
      }
      version += 1;
    }
    return { ok: true, data, version: record.v, migrated: true, reason: '' };
  }

  /** Deletes a record. */
  function remove(key) {
    try {
      backend.removeItem(prefix + key);
    } catch {
      // Nothing to remove from a store that refuses.
    }
  }

  /** Tells whether a record exists. */
  function has(key) {
    try {
      return backend.getItem(prefix + key) !== null;
    } catch {
      return false;
    }
  }

  /**
   * The names of the records in this namespace.
   * @param {string} [startingWith] Only names with this prefix ('save.' for the save slots).
   * @returns {string[]}
   */
  function keys(startingWith = '') {
    const names = [];
    try {
      for (let i = 0; i < backend.length; i += 1) {
        const name = backend.key(i);
        if (name && name.startsWith(prefix + startingWith)) names.push(name.slice(prefix.length));
      }
    } catch {
      // An unreadable store has no records.
    }
    return names.sort();
  }

  /** The bytes this namespace occupies (two per UTF-16 unit, as browsers count their quota). */
  function bytesUsed() {
    let total = 0;
    for (const name of keys()) {
      try {
        total += storedBytes(prefix + name, backend.getItem(prefix + name) ?? '');
      } catch {
        // Skip what cannot be read.
      }
    }
    return total;
  }

  /** Deletes every record of this namespace. */
  function clear() {
    for (const name of keys()) remove(name);
  }

  return storage;
}

function storedBytes(key, text) {
  return (key.length + text.length) * 2;
}

/** @returns {StorageBackend | null} localStorage when a probe write works, else null. */
function findWorkingLocalStorage() {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const probe = 'marazul:probe';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

/** @returns {StorageBackend} A stand-in that lives as long as the page. */
export function createMemoryBackend() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => {
      items.set(key, String(value));
    },
    removeItem: (key) => {
      items.delete(key);
    },
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
}
