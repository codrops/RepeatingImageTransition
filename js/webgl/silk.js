// 'silk' surface: supple sheets that ripple and catch the light, revealed and hidden by a
// soft, wavy edge that sweeps in the clip-path direction and lifts towards the viewer.
// uStrength is the depth of the folds, as a fraction of the sheet's width.

import { noise, cover, project } from './glsl.js';

export const vertexShader = `
  attribute vec2 aUv;

  uniform vec4 uRect; // left, top, width, height in CSS px
  uniform vec2 uViewport;
  uniform vec2 uTravel; // unit direction from the clicked item to the panel
  uniform vec3 uWipe;
  uniform float uReveal;
  uniform float uHide;
  uniform float uStrength;
  uniform float uRotation;
  uniform float uSeed;
  uniform float uTime;

  varying vec2 vUv;
  varying float vShade;

  const float PI = 3.14159265;

  ${project}

  // Height of the surface, in sheet widths: folds running along the direction of travel,
  // and the edges being unrolled and rolled away lifting towards the viewer
  float surface(vec2 uv) {
    vec2 p = (uv - 0.5) * vec2(1.0, uRect.w / uRect.z);
    float along = dot(p, uTravel);
    float across = dot(p, vec2(-uTravel.y, uTravel.x));
    float folds =
      sin(along * PI * 2.0 - uTime * 3.2 + uSeed) * 0.6 +
      sin(across * PI * 1.4 + along * 2.5 - uTime * 2.1 + uSeed * 1.7) * 0.4;
    float x = dot(uv, uWipe.xy) + uWipe.z;
    float front = mix(-0.1, 1.45, uReveal);
    float back = mix(-0.45, 1.1, uHide);
    float lift = max(
      smoothstep(front - 0.35, front, x),
      1.0 - smoothstep(back, back + 0.35, x)
    );
    return (folds * 0.5 + lift) * uStrength;
  }

  void main() {
    vUv = aUv;

    // Light the folds from the top left, by their slope
    float height = surface(aUv);
    float slopeX = (surface(aUv + vec2(0.01, 0.0)) - height) / 0.01;
    float slopeY = (surface(aUv + vec2(0.0, 0.01)) - height) / (0.01 * uRect.w / uRect.z);
    vShade = (slopeX * 0.6 + slopeY * 0.8) * 0.45;

    gl_Position = project(aUv, height * uRect.z);
  }
`;

export const fragmentShader = `
  precision highp float;

  uniform sampler2D uTexture;
  uniform vec2 uImageSize;
  uniform vec4 uRect;
  uniform vec3 uWipe;
  uniform float uReveal;
  uniform float uHide;
  uniform float uOpacity;
  uniform float uEdgeNoise;
  uniform float uSeed;

  varying vec2 vUv;
  varying float vShade;

  ${noise(3)}
  ${cover}

  void main() {
    // A soft, wavy edge sweeps across the sheet to reveal it, and a second one to hide it.
    // Both start and end fully outside the sheet, so 0 and 1 are exactly hidden and shown.
    float soft = 0.02;
    float x = dot(vUv, uWipe.xy) + uWipe.z;
    x += (fbm(vUv * vec2(2.0, 2.5) + uSeed) - 0.45) * uEdgeNoise;
    float start = -0.5 * uEdgeNoise - soft;
    float end = 1.0 + 0.5 * uEdgeNoise + soft;
    float front = mix(start, end, uReveal);
    float back = mix(start, end, uHide);
    float mask =
      (1.0 - smoothstep(front - soft, front + soft, x)) *
      smoothstep(back - soft, back + soft, x);

    vec3 color = texture2D(uTexture, cover(vUv)).rgb * (1.0 + vShade);
    float alpha = mask * uOpacity;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;
