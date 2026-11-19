// The flashback in the cockpit: the wingmen on the radio eight years ago, the alarms, then
// silence. An overlay, not a picture: the scene holds no shot, so the flight's own camera stays
// on the cockpit and the aircraft keeps flying; the colour drains behind a cold grey veil (an
// rgba colour, so the world shows through it), the old alarm and a heartbeat come up, four
// lines of memory, a ringing silence, and the colour comes back with his own voice. Nothing of
// what happened is shown.
import { createSceneScript } from '../../cinematics/sceneScript.js';

const DRAINED = 'rgba(96, 108, 120, 0.46)';
const COLD = 'rgba(46, 54, 62, 0.64)';
const SILENT = 'rgba(18, 21, 25, 0.8)';

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const FLASHBACK_SCENE = {
  id: 'flashback',
  build(params, tools) {
    const s = createSceneScript({ skippable: true, letterbox: false }, tools);
    s.fade({ to: 1, seconds: 1.3, colour: DRAINED });
    s.sound('heartbeat', { action: 'start', volume: 0.6, fadeSeconds: 1.2 });
    s.at(0.5).sound('cockpit_alarm', { action: 'start', volume: 0.45, fadeSeconds: 0.6 });
    s.at(0.9).line('fb_01', { channel: 'memory', gap: 0.15 });
    s.line('fb_02', { channel: 'memory', gap: 0.15 });
    s.fade({ to: 1, seconds: 0.2, colour: COLD });
    s.sound('heartbeat', { action: 'start', volume: 0.9, fadeSeconds: 0.4 });
    s.line('fb_03', { channel: 'memory', gap: 0.1 });
    s.line('fb_04', { channel: 'memory', gap: 0 });
    // Silence: the alarm cut off, the ringing, two seconds of nothing.
    s.sound('cockpit_alarm', { action: 'stop', fadeSeconds: 0.08 });
    s.sound('heartbeat', { action: 'stop', fadeSeconds: 0.5 });
    s.fade({ to: 1, seconds: 0.15, colour: SILENT });
    s.sound('tinnitus', { action: 'start', volume: 0.5 });
    s.wait(2);
    s.sound('tinnitus', { action: 'stop', fadeSeconds: 1.2 });
    s.fade({ to: 0, seconds: 1.4, colour: SILENT });
    s.wait(0.5);
    s.line('fb_05', { channel: 'helmet', gap: 0.2 });
    s.mark('flashback_done');
    s.end({});
    return s.script();
  },
};
