// The in-game clock and calendar: the time of day in clock hours, the day count and the weekday.
// A game day lasts 24 real minutes by default (one game hour per real minute). The engine
// advances the clock with simulated time and publishes its changes; the atmosphere reads
// timeOfDay every frame (sunrise 06:30, sunset 19:30), shops and traffic read hour and weekday.
//
//   clock.advance(1 / 60);                 // every fixed step
//   clock.timeOfDay                        // 18.83 = 18:50
//   clock.label()                          // 'Fri 18:50'
//   clock.setTimeOfDay(6.5);               // a cut to sunrise

/**
 * @typedef {Object} GameClockEvents
 * @property {(event: {day: number, hour: number, weekday: string}) => void} [onHourChanged]
 * @property {(event: {day: number, weekday: string}) => void} [onDayChanged]
 * @property {(event: {phase: string, previous: string}) => void} [onDayPhaseChanged]
 */

/**
 * Creates the clock.
 * @param {GameClockEvents & {dayLengthSeconds?: number, startHour?: number, startDay?: number}} [options]
 *   dayLengthSeconds is the real duration of 24 game hours at time scale 1 (default 1440);
 *   startHour and startDay are where a new game begins (default 15:00 on day 1, a Friday).
 * @returns {ReturnType<typeof buildGameClock>}
 */
export function createGameClock(options = {}) {
  return buildGameClock(options);
}

/** Weekday names; day 1 of a new game is a Friday. */
export const WEEKDAY_NAMES = Object.freeze(['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);

/** Where the phases of the day begin, in clock hours, matched to the atmosphere's sun. */
export const DAY_PHASE_STARTS = Object.freeze({ dawn: 5.5, day: 7.5, dusk: 18.5, night: 20.5 });

/**
 * The phase of the day at a clock time.
 * @param {number} timeOfDay Clock hours, 0 to 24.
 * @returns {'dawn' | 'day' | 'dusk' | 'night'}
 */
export function dayPhaseAt(timeOfDay) {
  if (timeOfDay >= DAY_PHASE_STARTS.night || timeOfDay < DAY_PHASE_STARTS.dawn) return 'night';
  if (timeOfDay >= DAY_PHASE_STARTS.dusk) return 'dusk';
  if (timeOfDay >= DAY_PHASE_STARTS.day) return 'day';
  return 'dawn';
}

function buildGameClock(options) {
  const clock = {
    /** Real seconds one game day takes at time scale 1. */
    dayLengthSeconds: options.dayLengthSeconds ?? 1440,
    /** Clock hours, 0 (midnight) up to 24. */
    timeOfDay: options.startHour ?? 15,
    /** The day count, starting at 1. */
    day: options.startDay ?? 1,
    /** While true advance() does nothing: showcase scenes and cutscenes hold the light still. */
    frozen: false,
    advance,
    setTimeOfDay,
    skipHours,
    label,
    timeLabel,
    serialise,
    restore,
    /** The whole hour, 0 to 23. */
    get hour() {
      return Math.floor(clock.timeOfDay) % 24;
    },
    /** The minute within the hour, 0 to 59. */
    get minute() {
      return Math.floor((clock.timeOfDay % 1) * 60);
    },
    /** The weekday name of the current day. */
    get weekday() {
      return WEEKDAY_NAMES[(clock.day - 1) % 7];
    },
    /** 'dawn', 'day', 'dusk' or 'night'. */
    get phase() {
      return dayPhaseAt(clock.timeOfDay);
    },
    /** Game hours since 00:00 of day 1. */
    get totalHours() {
      return (clock.day - 1) * 24 + clock.timeOfDay;
    },
    /** Game hours that pass per simulated second. */
    get hoursPerSecond() {
      return 24 / clock.dayLengthSeconds;
    },
  };

  /**
   * Moves the clock forward.
   * @param {number} deltaSeconds Simulated seconds.
   */
  function advance(deltaSeconds) {
    if (clock.frozen || deltaSeconds <= 0) return;
    moveForward(deltaSeconds * clock.hoursPerSecond);
  }

  /**
   * Jumps to a time of day on the current day (a cut, not a fade).
   * @param {number} hours Clock hours; wrapped into 0..24.
   * @param {number} [day] Also jump to this day.
   */
  function setTimeOfDay(hours, day) {
    const previousHour = clock.hour;
    const previousDay = clock.day;
    const previousPhase = clock.phase;
    clock.timeOfDay = ((hours % 24) + 24) % 24;
    if (day !== undefined) clock.day = Math.max(1, Math.floor(day));
    if (clock.day !== previousDay && options.onDayChanged) {
      options.onDayChanged({ day: clock.day, weekday: clock.weekday });
    }
    if ((clock.hour !== previousHour || clock.day !== previousDay) && options.onHourChanged) {
      options.onHourChanged({ day: clock.day, hour: clock.hour, weekday: clock.weekday });
    }
    announcePhase(previousPhase);
  }

  /**
   * Lets time pass at once (sleeping in a safehouse): every hour and day on the way is announced.
   * @param {number} hours Game hours to skip; negative values are ignored.
   */
  function skipHours(hours) {
    if (hours > 0) moveForward(hours);
  }

  /** 'Fri 18:50'. */
  function label() {
    return `${clock.weekday} ${timeLabel()}`;
  }

  /** '18:50'. */
  function timeLabel() {
    return `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
  }

  /** The clock as plain data for the save file. */
  function serialise() {
    return { day: clock.day, timeOfDay: Math.round(clock.timeOfDay * 10000) / 10000 };
  }

  /**
   * Restores the clock from a save file without announcing the hours in between.
   * @param {{day?: number, timeOfDay?: number}} saved What serialise() returned.
   */
  function restore(saved) {
    if (!saved) return;
    setTimeOfDay(saved.timeOfDay ?? clock.timeOfDay, saved.day ?? clock.day);
  }

  function moveForward(hours) {
    let remaining = hours;
    while (remaining > 0) {
      const previousPhase = clock.phase;
      // Step to the next whole hour at most, so that every hour is announced exactly once.
      const toNextHour = Math.floor(clock.timeOfDay) + 1 - clock.timeOfDay;
      const step = Math.min(remaining, toNextHour);
      remaining -= step;
      clock.timeOfDay += step;
      const crossedHour = step >= toNextHour - 1e-12;
      if (crossedHour) clock.timeOfDay = Math.round(clock.timeOfDay);
      if (clock.timeOfDay >= 24) {
        clock.timeOfDay -= 24;
        clock.day += 1;
        if (options.onDayChanged) options.onDayChanged({ day: clock.day, weekday: clock.weekday });
      }
      if (crossedHour && options.onHourChanged) {
        options.onHourChanged({ day: clock.day, hour: clock.hour, weekday: clock.weekday });
      }
      announcePhase(previousPhase);
    }
  }

  function announcePhase(previousPhase) {
    const phase = clock.phase;
    if (phase !== previousPhase && options.onDayPhaseChanged) {
      options.onDayPhaseChanged({ phase, previous: previousPhase });
    }
  }

  return clock;
}
