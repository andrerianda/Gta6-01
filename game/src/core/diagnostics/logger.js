// The game's logger. In normal play nothing but a real fault reaches the browser console; every
// message is kept in a short history that the debug object and the error overlay can show. Each
// system gets a child logger that stamps its messages with the system's name.
//
//   const log = createLogger();                  // console threshold 'error'
//   const trafficLog = log.child('traffic');
//   trafficLog.warn('no lane near spawn point', point);     // history only
//   trafficLog.error('lane graph is empty');                 // console.error + history + onError

/**
 * @typedef {Object} LogEntry
 * @property {number} sequence Counts up from 1.
 * @property {'debug' | 'info' | 'warn' | 'error'} level
 * @property {string} scope The system or part that spoke; '' for the root.
 * @property {string} message
 */

/**
 * Creates the root logger.
 * @param {Object} [options]
 * @param {'debug' | 'info' | 'warn' | 'error' | 'silent'} [options.consoleLevel] The least severe
 *   level that is printed to the console; default 'error'.
 * @param {Pick<Console, 'debug' | 'info' | 'warn' | 'error'>} [options.console] Where to print;
 *   default the global console.
 * @param {number} [options.historySize] Entries kept; default 200.
 * @param {(entry: LogEntry, details: any[]) => void} [options.onError] Called for every error.
 * @returns {ReturnType<typeof buildLogger>}
 */
export function createLogger(options = {}) {
  const shared = {
    consoleLevel: options.consoleLevel ?? 'error',
    console: options.console ?? globalThis.console,
    historySize: options.historySize ?? 200,
    onError: options.onError ?? null,
    /** @type {LogEntry[]} */
    history: [],
    sequence: 0,
    counts: { debug: 0, info: 0, warn: 0, error: 0 },
  };
  return buildLogger(shared, '');
}

/** Severity order. */
export const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

function buildLogger(shared, scope) {
  const logger = {
    scope,
    debug: (message, ...details) => write('debug', message, details),
    info: (message, ...details) => write('info', message, details),
    warn: (message, ...details) => write('warn', message, details),
    error: (message, ...details) => write('error', message, details),
    /**
     * A logger for one system or part; it shares the history and the settings of its parent.
     * @param {string} childScope The name stamped on its messages.
     */
    child: (childScope) => buildLogger(shared, scope ? `${scope}.${childScope}` : childScope),
    /**
     * Changes what is printed to the console.
     * @param {'debug' | 'info' | 'warn' | 'error' | 'silent'} level The least severe level printed.
     */
    setConsoleLevel: (level) => {
      shared.consoleLevel = level;
    },
    /**
     * The recent entries, oldest first.
     * @param {'debug' | 'info' | 'warn' | 'error'} [minimumLevel] Leave out less severe entries.
     * @returns {LogEntry[]}
     */
    history: (minimumLevel = 'debug') => {
      const floor = LOG_LEVELS.indexOf(minimumLevel);
      return shared.history.filter((entry) => LOG_LEVELS.indexOf(entry.level) >= floor);
    },
    /** How many messages of each level were logged since the start. */
    counts: () => ({ ...shared.counts }),
  };

  function write(level, message, details) {
    shared.sequence += 1;
    shared.counts[level] += 1;
    /** @type {LogEntry} */
    const entry = { sequence: shared.sequence, level, scope, message: String(message) };
    shared.history.push(entry);
    if (shared.history.length > shared.historySize) shared.history.shift();
    const threshold = LOG_LEVELS.indexOf(shared.consoleLevel);
    if (threshold !== -1 && LOG_LEVELS.indexOf(level) >= threshold && shared.console) {
      const text = scope ? `[${scope}] ${entry.message}` : entry.message;
      shared.console[level](text, ...details);
    }
    if (level === 'error' && shared.onError) shared.onError(entry, details);
  }

  return logger;
}
