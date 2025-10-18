// Terrain rendering shader (WGSL)

struct Uniforms {
  // c0: center.x, center.y, zoom, cellSize
  c0: vec4f,
  // c1: canvasSize.x, canvasSize.y, mapSize.x, mapSize.y (map size in world units)
  c1: vec4f,
  // c2: lightDir.x, lightDir.y, lightDir.z, heightScale
  c2: vec4f,
  // c3: ambient, padding
  c3: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
@group(0) @binding(2) var heightSampler: sampler;

struct VSOut {
  @builtin(position) position: vec4f,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f( 3.0,  1.0),
    vec2f(-1.0,  1.0)
  );
  var out: VSOut;
  out.position = vec4f(positions[vid], 0.0, 1.0);
  return out;
}

fn base_color(h: f32) -> vec3f {
  // Simple green gradient by height
  let low = vec3f(0.05, 0.2, 0.08);
  let high = vec3f(0.25, 0.6, 0.3);
  return mix(low, high, clamp(h, 0.0, 1.0));
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let center = uniforms.c0.xy;
  let zoom = uniforms.c0.z;
  let cellSize = uniforms.c0.w;

  let canvasSize = uniforms.c1.xy;
  let mapSize = uniforms.c1.zw; // world units (pixels)

  let lightDir = normalize(uniforms.c2.xyz);
  let heightScale = uniforms.c2.w; // world height scale in same units as map

  let ambient = uniforms.c3.x;

  // Convert screen pixel to world coordinate
  let screen = fragCoord.xy;
  let world = vec2f(
    center.x + (screen.x - 0.5 * canvasSize.x) / max(zoom, 0.0001),
    center.y + (screen.y - 0.5 * canvasSize.y) / max(zoom, 0.0001)
  );

  // Wrap world coordinates to map dimensions (torus)
  let wrapped = vec2f(
    world.x - floor(world.x / mapSize.x) * mapSize.x,
    world.y - floor(world.y / mapSize.y) * mapSize.y
  );

  // Convert world position to grid UV
  let gridSize = vec2f(textureDimensions(heightTex));
  let gridPos = wrapped / max(cellSize, 0.0001);
  let uv = fract(gridPos / gridSize);

  // Sample heights with bilinear filtering
  let h = textureSampleLevel(heightTex, heightSampler, uv, 0.0).x;

  // Neighbor offsets in UV space
  let du = vec2f(1.0 / gridSize.x, 0.0);
  let dv = vec2f(0.0, 1.0 / gridSize.y);

  // Sample neighbors for gradient
  let hx1 = textureSampleLevel(heightTex, heightSampler, fract(uv + du), 0.0).x;
  let hx0 = textureSampleLevel(heightTex, heightSampler, fract(uv - du), 0.0).x;
  let hy1 = textureSampleLevel(heightTex, heightSampler, fract(uv + dv), 0.0).x;
  let hy0 = textureSampleLevel(heightTex, heightSampler, fract(uv - dv), 0.0).x;

  // Convert to world-space gradients (dz/dx, dz/dy)
  let dzdx = (hx1 - hx0) * heightScale / (2.0 * cellSize);
  let dzdy = (hy1 - hy0) * heightScale / (2.0 * cellSize);

  // Heightfield normal
  let n = normalize(vec3f(-dzdx, -dzdy, 1.0));

  // Lambertian lighting
  let ndl = max(dot(n, lightDir), 0.0);
  let lighting = ambient + (1.0 - ambient) * ndl;

  let color = base_color(h) * lighting;
  return vec4f(color, 1.0);
}
