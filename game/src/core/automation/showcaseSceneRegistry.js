// The showcase scene registry: named scenes for automated screenshots, chosen by the page's
// query string (?shot=<name>&seed=<n>) or run through the debug object. A scene sets the real
// game up through its normal systems (commands, events, the entity registry), plays the real
// rules forward with tools.advance(seconds) and leaves the picture to the engine, which waits
// for streaming, settles the image and draws the frame. Scenes live under game/src/showcase/.
//
//   context.showcase.register({
//     name: 'police-chase', title: 'Three stars on Avenida del Mar',
//     async run(context, tools) {
//       context.commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 3 });
//       tools.advance(6);
//     },
//   });

/**
 * @typedef {Object} ShowcaseScene
 * @property {string} name The scene's name in the query string: lower case, digits and dashes.
 * @property {string} [title] A caption.
 * @property {string} [description] What the picture shows.
 * @property {(context: object, tools: ShowcaseTools) => (void | Promise<void>)} run Sets the
 *   scene up and plays it forward.
 */

/**
 * @typedef {Object} ShowcaseTools What the engine hands a scene.
 * @property {number | string} seed The seed asked for.
 * @property {object} random A seeded generator for this scene and seed.
 * @property {(seconds: number) => number} advance Runs the simulation forward in fixed steps
 *   without drawing; returns the steps run.
 * @property {() => Promise<boolean>} whenIdle Waits until streaming and loading have finished.
 */

/**
 * Creates an empty registry.
 * @returns {{register: (scene: ShowcaseScene) => (() => void), has: (name: string) => boolean,
 *   get: (name: string) => (ShowcaseScene | null), names: () => string[],
 *   list: () => {name: string, title: string, description: string}[]}}
 */
export function createShowcaseSceneRegistry() {
  /** @type {Map<string, ShowcaseScene>} */
  const scenes = new Map();

  return {
    /**
     * Adds a scene.
     * @param {ShowcaseScene} scene
     * @returns {() => void} Call it to remove the scene again.
     */
    register(scene) {
      if (!scene || typeof scene.name !== 'string' || !SHOWCASE_NAME_PATTERN.test(scene.name)) {
        throw new Error(`a showcase scene needs a name of lower-case letters, digits and dashes, not "${scene?.name}"`);
      }
      if (typeof scene.run !== 'function') {
        throw new Error(`the showcase scene "${scene.name}" has no run(context, tools) function`);
      }
      if (scenes.has(scene.name)) {
        throw new Error(`a showcase scene named "${scene.name}" is already registered`);
      }
      scenes.set(scene.name, scene);
      return () => {
        if (scenes.get(scene.name) === scene) scenes.delete(scene.name);
      };
    },
    has: (name) => scenes.has(name),
    get: (name) => scenes.get(name) ?? null,
    names: () => [...scenes.keys()],
    list: () => [...scenes.values()].map((scene) => ({
      name: scene.name,
      title: scene.title ?? scene.name,
      description: scene.description ?? '',
    })),
  };
}

/** What a scene name looks like. */
export const SHOWCASE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
