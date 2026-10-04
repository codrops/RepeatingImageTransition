// GLSL shared by the sheet surfaces

// Value noise, and fbm() summing a few octaves of it (from 0 to about 0.94, around 0.47).
// The hash has no sin(), which keeps it cheap on phone GPUs.
export const noise = (octaves) => `
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < ${octaves}; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }
`;

// Sample the image like background-size: cover (needs the uRect and uImageSize uniforms)
export const cover = `
  vec2 cover(vec2 uv) {
    float rectRatio = uRect.z / uRect.w;
    float imageRatio = uImageSize.x / uImageSize.y;
    vec2 scale = rectRatio > imageRatio
      ? vec2(1.0, imageRatio / rectRatio)
      : vec2(rectRatio / imageRatio, 1.0);
    return (uv - 0.5) * scale + 0.5;
  }
`;

// Place a sheet in CSS px (uRect, with uRotation around its center) and return its position
// in clip space for a given depth, with the same 1000px perspective as CSS
export const project = `
  vec4 project(vec2 uv, float depth) {
    vec2 size = uRect.zw;
    vec2 p = (uv - 0.5) * size;
    p = mat2(cos(uRotation), sin(uRotation), -sin(uRotation), cos(uRotation)) * p;
    vec2 position = uRect.xy + size * 0.5 + p;
    vec2 origin = uViewport * 0.5;
    position = origin + (position - origin) * 1000.0 / (1000.0 - depth);
    vec2 clip = position / uViewport * 2.0 - 1.0;
    return vec4(clip.x, -clip.y, 0.0, 1.0);
  }
`;
