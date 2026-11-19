// The event bus: how the systems of MARAZUL tell one another what happened without knowing who
// listens. Topics are the strings catalogued in gameEvents.js; payloads are plain objects.
//
//   const off = events.on(GAME_EVENTS.WANTED_LEVEL_CHANGED, ({ level }) => hud.showStars(level));
//   events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: 2, previous: 1, heat: 61 });
//   events.queue(GAME_EVENTS.SAVE_REQUESTED, { reason: 'autosave' });   // delivered at the next flush
//   off();

/**
 * @typedef {(payload: any, topic: string) => void} EventHandler
 */

/**
 * Creates an event bus.
 * @param {Object} [options]
 * @param {Iterable<string>} [options.knownTopics] The catalogue; when given, a topic outside it
 *   is reported once through onUnknownTopic (a misspelt topic is the classic silent bug).
 * @param {(topic: string) => void} [options.onUnknownTopic] Receives each unknown topic once.
 * @param {(failure: {topic: string, error: Error}) => void} [options.onHandlerError] Receives an
 *   error thrown by a handler; the other handlers of the event still run.
 * @param {number} [options.historySize] How many recent topics to remember for diagnostics.
 * @returns {ReturnType<typeof buildEventBus>}
 */
export function createEventBus(options = {}) {
  return buildEventBus(options);
}

function buildEventBus(options) {
  const knownTopics = options.knownTopics ? new Set(options.knownTopics) : null;
  const reportedUnknown = new Set();
  const historySize = options.historySize ?? 48;
  /** @type {Map<string, EventHandler[]>} Handler lists are replaced, never mutated, on change. */
  const handlers = new Map();
  /** @type {{topic: string, payload: any}[]} */
  let queued = [];
  /** @type {string[]} */
  const history = [];

  const bus = {
    on,
    once,
    off,
    emit,
    queue,
    flush,
    listenerCount: (topic) => handlers.get(topic)?.length ?? 0,
    /** The most recent topics emitted, oldest first. */
    recentTopics: () => history.slice(),
    /** Events waiting for the next flush(). */
    get queuedCount() {
      return queued.length;
    },
    /** Total events delivered since the start. */
    emittedCount: 0,
  };

  /**
   * Subscribes to a topic.
   * @param {string} topic A topic of the catalogue.
   * @param {EventHandler} handler Called with the payload each time the topic is emitted.
   * @returns {() => void} Call it to unsubscribe.
   */
  function on(topic, handler) {
    checkTopic(topic);
    const list = handlers.get(topic);
    handlers.set(topic, list ? [...list, handler] : [handler]);
    return () => off(topic, handler);
  }

  /**
   * Subscribes for one delivery only.
   * @param {string} topic A topic of the catalogue.
   * @param {EventHandler} handler Called once.
   * @returns {() => void} Call it to unsubscribe before the event came.
   */
  function once(topic, handler) {
    const wrapper = (payload, emittedTopic) => {
      off(topic, wrapper);
      handler(payload, emittedTopic);
    };
    return on(topic, wrapper);
  }

  /**
   * Removes a subscription.
   * @param {string} topic The topic it was made on.
   * @param {EventHandler} handler The handler given to on().
   */
  function off(topic, handler) {
    const list = handlers.get(topic);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index === -1) return;
    if (list.length === 1) handlers.delete(topic);
    else handlers.set(topic, [...list.slice(0, index), ...list.slice(index + 1)]);
  }

  /**
   * Delivers an event to every subscriber now, in subscription order.
   * @param {string} topic A topic of the catalogue.
   * @param {object} [payload] The event's data; treat it as read-only.
   * @returns {number} How many handlers were called.
   */
  function emit(topic, payload) {
    checkTopic(topic);
    bus.emittedCount += 1;
    if (historySize > 0) {
      history.push(topic);
      if (history.length > historySize) history.shift();
    }
    const list = handlers.get(topic);
    if (!list) return 0;
    for (let i = 0; i < list.length; i += 1) {
      try {
        list[i](payload, topic);
      } catch (error) {
        const failure = { topic, error: error instanceof Error ? error : new Error(String(error)) };
        if (options.onHandlerError) options.onHandlerError(failure);
        else throw failure.error;
      }
    }
    return list.length;
  }

  /**
   * Holds an event until the next flush(): the engine flushes after every fixed step and every
   * frame, so a queued event never interrupts the system that raised it.
   * @param {string} topic A topic of the catalogue.
   * @param {object} [payload] The event's data.
   */
  function queue(topic, payload) {
    checkTopic(topic);
    queued.push({ topic, payload });
  }

  /**
   * Delivers the queued events in the order they were queued, including those queued by the
   * handlers themselves (up to a generous limit that stops a feedback loop).
   * @returns {number} How many events were delivered.
   */
  function flush() {
    let delivered = 0;
    for (let round = 0; queued.length > 0 && round < 16; round += 1) {
      const batch = queued;
      queued = [];
      for (let i = 0; i < batch.length; i += 1) {
        emit(batch[i].topic, batch[i].payload);
        delivered += 1;
      }
    }
    return delivered;
  }

  function checkTopic(topic) {
    if (!knownTopics || knownTopics.has(topic) || reportedUnknown.has(topic)) return;
    reportedUnknown.add(topic);
    if (options.onUnknownTopic) options.onUnknownTopic(topic);
  }

  return bus;
}
