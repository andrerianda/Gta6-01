// The command queue: how one system asks another to do something. An event says what happened to
// whoever listens; a command is a request addressed to the single system that owns the thing
// (teleport the player, set the wanted level, spawn a vehicle). The names are catalogued in
// gameCommands.js.
//
//   commands.handle(GAME_COMMANDS.PLAYER_TELEPORT, ({ position, heading }) => movePlayer(position, heading));
//   commands.send(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: 0, y: 2, z: 0 } });   // at the next flush
//   const cash = commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: 500 });        // now, with a result

/**
 * @typedef {(payload: any) => any} CommandHandler
 */

/**
 * Creates a command queue.
 * @param {Object} [options]
 * @param {(name: string) => void} [options.onUnhandled] Receives the name of a command nobody
 *   handles, once per name.
 * @param {(failure: {command: string, error: Error}) => void} [options.onHandlerError] Receives
 *   an error thrown by a handler of a queued command.
 * @returns {ReturnType<typeof buildCommandQueue>}
 */
export function createCommandQueue(options = {}) {
  return buildCommandQueue(options);
}

function buildCommandQueue(options) {
  /** @type {Map<string, CommandHandler>} */
  const handlers = new Map();
  /** @type {{name: string, payload: any}[]} */
  let pending = [];
  const reportedUnhandled = new Set();

  const queue = {
    handle,
    has: (name) => handlers.has(name),
    send,
    run,
    flush,
    /** The names that have a handler now. */
    handledNames: () => [...handlers.keys()],
    /** Commands waiting for the next flush(). */
    get pendingCount() {
      return pending.length;
    },
  };

  /**
   * Registers the handler of a command. One system owns each command; a second registration
   * replaces the first (a real system taking over from a stub).
   * @param {string} name A command name of the catalogue.
   * @param {CommandHandler} handler Carries the request out; what it returns is run()'s result.
   * @returns {() => void} Call it to unregister.
   */
  function handle(name, handler) {
    handlers.set(name, handler);
    return () => {
      if (handlers.get(name) === handler) handlers.delete(name);
    };
  }

  /**
   * Queues a request; it is carried out at the next flush (the engine flushes at the start of
   * every fixed step and every frame), never in the middle of the caller's own update.
   * @param {string} name A command name of the catalogue.
   * @param {object} [payload] The request's parameters.
   */
  function send(name, payload) {
    pending.push({ name, payload });
  }

  /**
   * Carries a request out at once and returns the handler's result.
   * @param {string} name A command name of the catalogue.
   * @param {object} [payload] The request's parameters.
   * @returns {any} What the handler returned; undefined when nobody handles the command.
   */
  function run(name, payload) {
    const handler = handlers.get(name);
    if (!handler) {
      if (!reportedUnhandled.has(name)) {
        reportedUnhandled.add(name);
        if (options.onUnhandled) options.onUnhandled(name);
      }
      return undefined;
    }
    return handler(payload);
  }

  /**
   * Carries out the queued requests in the order they were sent.
   * @returns {number} How many were carried out or dropped.
   */
  function flush() {
    if (pending.length === 0) return 0;
    const batch = pending;
    pending = [];
    for (let i = 0; i < batch.length; i += 1) {
      try {
        run(batch[i].name, batch[i].payload);
      } catch (error) {
        const failure = {
          command: batch[i].name,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        if (options.onHandlerError) options.onHandlerError(failure);
        else throw failure.error;
      }
    }
    return batch.length;
  }

  return queue;
}
