// Time and weather: moves the in-game clock with the simulation (a game day lasts 24 real
// minutes), holds it when the page asks for a fixed time, and owns the commands that set the
// time and the weather. The sky itself is drawn by the world render pipeline, which this system
// drives. Second wave: weather fronts by district and season, forecasts on the radio.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/**
 * Creates the time and weather system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createTimeAndWeatherSystem(context) {
  const { clock, commands, launch } = context;
  const pipeline = () => context.systems.find('worldRenderPipeline');

  return {
    name: 'timeAndWeather',
    dependsOn: ['worldRenderPipeline'],

    init() {
      if (launch.timeOfDay !== null) {
        clock.setTimeOfDay(launch.timeOfDay);
        clock.frozen = true;
      }
      commands.handle(GAME_COMMANDS.TIME_SET, ({ hours, day }) => {
        clock.setTimeOfDay(hours, day);
        pipeline()?.requestSettle();
      });
      commands.handle(GAME_COMMANDS.TIME_SKIP, ({ hours }) => {
        clock.skipHours(hours);
        pipeline()?.requestSettle();
      });
      commands.handle(GAME_COMMANDS.WEATHER_SET, ({ weather, seconds }) => {
        pipeline()?.setWeather(weather, seconds ?? 30);
      });
    },

    fixedUpdate(stepSeconds) {
      clock.advance(stepSeconds);
    },
  };
}
