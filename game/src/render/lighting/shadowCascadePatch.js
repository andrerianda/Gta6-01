// Teaches three.js's built-in lit materials about the sun's shadow cascades. three.js gives every
// shadow-casting directional light its own shadow map and its own lighting; MARAZUL's sun is
// several such lights standing in one place (see sunShadowRig.js), each covering a larger area
// around the camera. This patch rewrites one shader chunk so that a fragment takes its sun shadow
// from the tightest cascade that contains it (blending to the next near the edge) and is lit by
// the sun once.
//
// Rule for the whole game: the sun rig's lights are the only directional lights that cast
// shadows. Other directional lights (without shadows) keep working unchanged.
//
// The same patch makes every light loop skip the reflectance computation for lights that do not
// reach the fragment, which is what keeps the fixed pool of night lights cheap (skipUnlitLights).
//
// The patch is applied to THREE.ShaderChunk, so it affects every material compiled afterwards.
// If the chunk does not look as expected (a different three.js build), nothing is changed and the
// rig falls back to a single cascade.

import * as THREE from 'three';

/** The directional-light loop of three.js r185's lights_fragment_begin chunk, as shipped. */
const ORIGINAL_LOOP = [
  '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
  '\tDirectionalLight directionalLight;',
  '\t#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
  '\tDirectionalLightShadow directionalLightShadow;',
  '\t#endif',
  '\t#pragma unroll_loop_start',
  '\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {',
  '\t\tdirectionalLight = directionalLights[ i ];',
  '\t\tgetDirectionalLightInfo( directionalLight, directLight );',
  '\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )',
  '\t\tdirectionalLightShadow = directionalLightShadows[ i ];',
  '\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
  '\t\t#endif',
  '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
  '\t}',
  '\t#pragma unroll_loop_end',
  '#endif',
].join('\n');

const RE_DIRECT_CALL =
  'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

/** The replacement: first resolve the cascades into one shadow term, then light once. */
const CASCADE_LOOP = /* glsl */ `
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	// MARAZUL: all shadow-casting directional lights are cascades of one sun.
	float marazulSunShadow = 1.0;
	float marazulCascadeRoom = 1.0;
	vec3 marazulCascadeEdge;
	float marazulCascadeWeight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		if ( marazulCascadeRoom > 0.004 ) {
			marazulCascadeEdge = abs( vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w * 2.0 - 1.0 );
			marazulCascadeWeight = 1.0 - smoothstep( 0.82, 0.98, max( marazulCascadeEdge.x, max( marazulCascadeEdge.y, marazulCascadeEdge.z ) ) );
			if ( marazulCascadeWeight > 0.0 ) {
				directionalLightShadow = directionalLightShadows[ i ];
				marazulSunShadow -= marazulCascadeRoom * marazulCascadeWeight * ( 1.0 - marazulCascadeShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) );
				marazulCascadeRoom *= 1.0 - marazulCascadeWeight;
			}
		}
	}
	#pragma unroll_loop_end
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
			#if UNROLLED_LOOP_INDEX == 0
			directLight.color *= ( directLight.visible && receiveShadow ) ? marazulSunShadow : 1.0;
			${RE_DIRECT_CALL}
			#elif UNROLLED_LOOP_INDEX >= NUM_DIR_LIGHT_SHADOWS
			${RE_DIRECT_CALL}
			#endif
		#else
		${RE_DIRECT_CALL}
		#endif
	}
	#pragma unroll_loop_end
#endif`;

/**
 * The cascade filter, appended to shadowmap_pars_fragment: eight taps on a rotated disc, each a
 * hardware 2x2 comparison, which gives a smooth penumbra a few texels wide. With shadow map types
 * other than PCF it defers to three.js's own getShadow().
 */
const CASCADE_FILTER = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float marazulCascadeShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		vec2 radius = shadowRadius / shadowMapSize;
		float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
		float shadow = 0.0;
		for ( int tap = 0; tap < 8; tap ++ ) {
			shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( tap, 8, phi ) * radius, shadowCoord.z ) );
		}
		return mix( 1.0, shadow * 0.125, shadowIntensity );
	}
	#else
	#define marazulCascadeShadow getShadow
	#endif
#endif`;

let patchState = 'pending';

/**
 * Applies the cascade patch to THREE.ShaderChunk once. Call before the first lit material is
 * compiled (the atmosphere facade does this when it is created).
 * @returns {boolean} True when cascades are available; false when the chunk was not recognised
 *   and the sun must use a single shadow map.
 */
export function applyShadowCascadePatch() {
  if (patchState !== 'pending') return patchState === 'applied';
  const lightsChunk = THREE.ShaderChunk.lights_fragment_begin;
  const shadowChunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (
    typeof lightsChunk !== 'string' ||
    typeof shadowChunk !== 'string' ||
    !lightsChunk.includes(ORIGINAL_LOOP) ||
    !shadowChunk.includes('interleavedGradientNoise') ||
    !shadowChunk.includes('vogelDiskSample')
  ) {
    patchState = 'unavailable';
    console.warn('MARAZUL: three.js shader chunks differ from the expected build; sun shadows use one cascade.');
    return false;
  }
  THREE.ShaderChunk.lights_fragment_begin = skipUnlitLights(lightsChunk.replace(ORIGINAL_LOOP, CASCADE_LOOP));
  THREE.ShaderChunk.shadowmap_pars_fragment = `${shadowChunk}\n${CASCADE_FILTER}`;
  patchState = 'applied';
  return true;
}

/**
 * Makes every light loop skip the material's reflectance computation when the light does not
 * reach the fragment (it is switched off, the fragment lies beyond its range or outside its
 * cone). The night's pool of real lights is always present in the shaders, most of it idle or out
 * of reach for most pixels; with this guard an idle light costs a distance test instead of a full
 * specular evaluation.
 * @param {string} chunk The lights_fragment_begin chunk.
 * @returns {string} The chunk with guarded calls.
 */
function skipUnlitLights(chunk) {
  return chunk.split(RE_DIRECT_CALL).join(`if ( directLight.visible ) ${RE_DIRECT_CALL}`);
}
