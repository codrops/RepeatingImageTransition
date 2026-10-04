// 'ink' surface: flat sheets that bloom like ink dropped in water. The picture spreads from
// uOrigin with an irregular front, soft at first and sharpening as it settles, drifts in a slow
// curling flow, pools darker along its edges like watercolor, and thins out into wisps to leave.
// uStrength is how much the picture swirls (0 = still).

import { noise, cover, project } from './glsl.js';

export const vertexShader = `
  attribute vec2 aUv;

  uniform vec4 uRect;
  uniform vec2 uViewport;
  uniform float uRotation;

  varying vec2 vUv;

  ${project}

  void main() {
    vUv = aUv;
    gl_Position = project(aUv, 0.0);
  }
`;

export const fragmentShader = `
  precision highp float;

  uniform sampler2D uTexture;
  uniform vec2 uImageSize;
  uniform vec4 uRect;
  uniform vec2 uOrigin; // where the ink starts to spread, in uv
  uniform float uReveal;
  uniform float uHide;
  uniform float uOpacity;
  uniform float uStrength;
  uniform float uEdgeNoise;
  uniform float uSeed;
  uniform float uTime;

  varying vec2 vUv;

  ${noise(3)}
  ${cover}

  void main() {
    vec2 aspect = vec2(1.0, uRect.w / uRect.z);

    // It spreads from the origin with an irregular front, in an oval that follows the
    // sheet's proportions. The front starts and ends fully outside the sheet, so 0 and 1
    // are exactly hidden and shown. Nothing else is worked out where it hasn't reached.
    float soft = 0.04;
    float spread = length(vUv - uOrigin) / length(max(uOrigin, 1.0 - uOrigin));
    spread += (fbm(vUv * aspect * 3.0 + uSeed * 1.3) - 0.47) * uEdgeNoise;
    float front = mix(-0.5 * uEdgeNoise - soft, 1.0 + 0.5 * uEdgeNoise + soft, uReveal);
    float bloom = 1.0 - smoothstep(front - soft, front + soft, spread);
    if (bloom <= 0.0) discard;

    // The picture drifts in a slow, curling flow while the ink moves
    vec2 flow = vec2(0.0);
    if (uStrength > 0.0) {
      vec2 q = vUv * aspect * 2.5 + uSeed;
      flow = vec2(
        fbm(q + vec2(0.0, uTime * 0.2)),
        fbm(q + vec2(5.2, 1.3) - uTime * 0.2)
      ) - 0.47;
    }
    vec2 uv = vUv + flow * uStrength * 0.25;

    // It leaves by thinning out into wisps, the lightest patches first
    float dissolve = 1.0;
    if (uHide > 0.0) {
      float fade = 0.08;
      float wisps = fbm(vUv * aspect * 4.0 + flow * 2.0 + uSeed * 2.1);
      float threshold = mix(-fade, 1.0 + fade, uHide);
      dissolve = smoothstep(threshold - fade, threshold + fade, wisps);
    }

    // Soft while it moves, sharp once it has settled (a mipmap bias, so no extra passes)
    float mask = bloom * dissolve;
    float blur = (1.0 - mask) * 2.0 + (1.0 - uReveal) * 1.5 + uHide;
    vec3 color = texture2D(uTexture, cover(uv), blur).rgb;

    // Pigment pools along the edges, darker and deeper, like watercolor
    float rim = max(bloom * (1.0 - bloom), dissolve * (1.0 - dissolve)) * 4.0;
    color = mix(color, color * color, rim * 0.35);

    float alpha = mask * uOpacity;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;
