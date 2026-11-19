// Anti-aliasing as the last stage: an edge-directed filter on the finished picture. Where the luma
// of a pixel differs enough from its neighbours, the stage finds which way the edge runs, walks
// along it in both directions to measure how long the stair step is, and shifts the pixel's sample
// point across the edge by the matching fraction; isolated bright pixels are softened by a
// sub-pixel blend. It expects display-encoded colour with luma in alpha (finalGradePass.js).
// Cost on a mid-range GPU at 1080p: about 0.4 ms (most pixels leave after five reads).

const ANTIALIAS_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSource;
uniform vec2 uTexel;

const float EDGE_THRESHOLD = 0.11;
const float EDGE_THRESHOLD_MIN = 0.028;
#ifndef SUBPIXEL
#define SUBPIXEL 0.7
#endif

float lumaAt(vec2 uv) {
  return texture2D(tSource, uv).a;
}

vec3 antialiased() {
  vec4 centre = texture2D(tSource, vUv);
  float lM = centre.a;
  float lS = lumaAt(vUv + vec2(0.0, -uTexel.y));
  float lN = lumaAt(vUv + vec2(0.0, uTexel.y));
  float lW = lumaAt(vUv + vec2(-uTexel.x, 0.0));
  float lE = lumaAt(vUv + vec2(uTexel.x, 0.0));

  float lMin = min(lM, min(min(lS, lN), min(lW, lE)));
  float lMax = max(lM, max(max(lS, lN), max(lW, lE)));
  float contrast = lMax - lMin;
  if (contrast < max(EDGE_THRESHOLD_MIN, lMax * EDGE_THRESHOLD)) {
    return centre.rgb;
  }

  float lSW = lumaAt(vUv + vec2(-uTexel.x, -uTexel.y));
  float lSE = lumaAt(vUv + vec2(uTexel.x, -uTexel.y));
  float lNW = lumaAt(vUv + vec2(-uTexel.x, uTexel.y));
  float lNE = lumaAt(vUv + vec2(uTexel.x, uTexel.y));

  // Second differences: a horizontal edge changes luma fastest from row to row.
  float horizontal = abs(lNW + lSW - 2.0 * lW) + 2.0 * abs(lN + lS - 2.0 * lM) + abs(lNE + lSE - 2.0 * lE);
  float vertical = abs(lNW + lNE - 2.0 * lN) + 2.0 * abs(lW + lE - 2.0 * lM) + abs(lSW + lSE - 2.0 * lS);
  bool isHorizontal = horizontal >= vertical;

  // The edge lies between this pixel and the neighbour with the steeper change.
  float lNegative = isHorizontal ? lS : lW;
  float lPositive = isHorizontal ? lN : lE;
  float gradientNegative = abs(lNegative - lM);
  float gradientPositive = abs(lPositive - lM);
  bool negativeSide = gradientNegative >= gradientPositive;
  float gradient = 0.25 * max(gradientNegative, gradientPositive);
  float across = isHorizontal ? uTexel.y : uTexel.x;
  if (negativeSide) across = -across;
  float edgeLuma = 0.5 * ((negativeSide ? lNegative : lPositive) + lM);

  vec2 edgeUv = vUv;
  if (isHorizontal) edgeUv.y += across * 0.5; else edgeUv.x += across * 0.5;
  vec2 along = isHorizontal ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y);

  // Walk along the edge both ways until the luma leaves it.
  vec2 uvBack = edgeUv - along;
  vec2 uvAhead = edgeUv + along;
  float endBack = lumaAt(uvBack) - edgeLuma;
  float endAhead = lumaAt(uvAhead) - edgeLuma;
  bool doneBack = abs(endBack) >= gradient;
  bool doneAhead = abs(endAhead) >= gradient;
  for (int i = 0; i < ANTIALIAS_STEPS; i++) {
    if (doneBack && doneAhead) break;
    float stride = i < 3 ? 1.5 : (i < 6 ? 2.0 : 4.0);
    if (!doneBack) {
      uvBack -= along * stride;
      endBack = lumaAt(uvBack) - edgeLuma;
      doneBack = abs(endBack) >= gradient;
    }
    if (!doneAhead) {
      uvAhead += along * stride;
      endAhead = lumaAt(uvAhead) - edgeLuma;
      doneAhead = abs(endAhead) >= gradient;
    }
  }

  float distanceBack = isHorizontal ? vUv.x - uvBack.x : vUv.y - uvBack.y;
  float distanceAhead = isHorizontal ? uvAhead.x - vUv.x : uvAhead.y - vUv.y;
  bool backIsNearer = distanceBack < distanceAhead;
  float span = distanceBack + distanceAhead;
  float edgeOffset = 0.5 - min(distanceBack, distanceAhead) / span;

  // Only shift when the nearer end of the edge really turns away from this pixel's side.
  bool centreIsDarker = lM < edgeLuma;
  bool endRises = (backIsNearer ? endBack : endAhead) < 0.0;
  if (endRises == centreIsDarker) edgeOffset = 0.0;

  // Sub-pixel detail: blend toward the neighbourhood average where the pixel stands out from it.
  float average = (2.0 * (lS + lN + lW + lE) + lSW + lSE + lNW + lNE) / 12.0;
  float standout = clamp(abs(average - lM) / contrast, 0.0, 1.0);
  float smooth1 = standout * standout * (3.0 - 2.0 * standout);
  float subpixelOffset = smooth1 * smooth1 * SUBPIXEL;

  float shift = max(edgeOffset, subpixelOffset);
  vec2 uv = vUv;
  if (isHorizontal) uv.y += shift * across; else uv.x += shift * across;
  return texture2D(tSource, uv).rgb;
}

void main() {
  vec3 color = antialiased();
#ifdef RESOLVE_SHARPEN
  // A supersampled buffer is shown at half size: the browser averages each 2x2 block. Lift the
  // detail one screen pixel wide beforehand so the resolve keeps it, clamped to the local range
  // so that no edge gets a halo.
  vec2 o = 2.0 * uTexel;
  vec3 a = texture2D(tSource, vUv + vec2(o.x, 0.0)).rgb;
  vec3 b = texture2D(tSource, vUv - vec2(o.x, 0.0)).rgb;
  vec3 c = texture2D(tSource, vUv + vec2(0.0, o.y)).rgb;
  vec3 d = texture2D(tSource, vUv - vec2(0.0, o.y)).rgb;
  vec3 low = min(color, min(min(a, b), min(c, d)));
  vec3 high = max(color, max(max(a, b), max(c, d)));
  color = clamp(color + RESOLVE_SHARPEN * (color - 0.25 * (a + b + c + d)), low, high);
#endif
  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Creates the anti-aliasing stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @returns {{
 *   setSteps: (steps: number) => void,
 *   setSupersample: (factor: number) => void,
 *   render: (source: import('three').Texture, width: number, height: number, target: import('three').WebGLRenderTarget | null) => void,
 *   dispose: () => void,
 * }}
 */
export function createAntialiasPass(drawer) {
  const material = drawer.createMaterial(
    'marazul-antialias',
    ANTIALIAS_FRAGMENT_SHADER,
    {
      tSource: { value: null },
      uTexel: { value: new Float32Array([1, 1]) },
    },
    { ANTIALIAS_STEPS: 8 },
  );

  /** Sets how far the edge search walks: 4 is cheap, 8 the default, 10 for long shallow edges. */
  function setSteps(steps) {
    if (material.defines.ANTIALIAS_STEPS !== steps) {
      material.defines.ANTIALIAS_STEPS = steps;
      material.needsUpdate = true;
    }
  }

  /**
   * Tells the stage how many buffer pixels make one screen pixel. Supersampled (2, the cinematic
   * tier) the frame is already anti-aliased by its extra pixels: the sub-pixel blend is lighter and
   * the stage pre-sharpens for the browser's 2x2 resolve. At 1 the stage is unchanged.
   * @param {number} factor Drawing-buffer pixels per CSS pixel.
   */
  function setSupersample(factor) {
    const supersampled = factor >= 1.75;
    const subpixel = supersampled ? '0.25' : undefined;
    const sharpen = supersampled ? '0.65' : undefined;
    if (material.defines.SUBPIXEL !== subpixel || material.defines.RESOLVE_SHARPEN !== sharpen) {
      if (subpixel === undefined) delete material.defines.SUBPIXEL;
      else material.defines.SUBPIXEL = subpixel;
      if (sharpen === undefined) delete material.defines.RESOLVE_SHARPEN;
      else material.defines.RESOLVE_SHARPEN = sharpen;
      material.needsUpdate = true;
    }
  }

  /**
   * Draws the anti-aliased picture.
   * @param {import('three').Texture} source Display-encoded colour with luma in alpha, bilinear.
   * @param {number} width Its width in pixels.
   * @param {number} height Its height in pixels.
   * @param {import('three').WebGLRenderTarget | null} target Where to draw (null is the canvas).
   */
  function render(source, width, height, target) {
    material.uniforms.tSource.value = source;
    material.uniforms.uTexel.value[0] = 1 / width;
    material.uniforms.uTexel.value[1] = 1 / height;
    drawer.draw(material, target);
  }

  function dispose() {
    material.dispose();
  }

  return { setSteps, setSupersample, render, dispose };
}
