// Terrain rendering shader (WGSL)

struct Uniforms {
  // c0: center.x, center.y, zoom, cellSize
  c0: vec4f,
  // c1: canvasSize.x, canvasSize.y, mapSize.x, mapSize.y (map size in world units)
  c1: vec4f,
  // c2: lightDir.x, lightDir.y, lightDir.z, heightScale
  c2: vec4f,
  // c3: ambient, waterLevel, time, padding
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

// Simple 2D noise function for water animation
fn noise2d(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  
  let a = sin(dot(i, vec2f(127.1, 311.7)));
  let b = sin(dot(i + vec2f(1.0, 0.0), vec2f(127.1, 311.7)));
  let c = sin(dot(i + vec2f(0.0, 1.0), vec2f(127.1, 311.7)));
  let d = sin(dot(i + vec2f(1.0, 1.0), vec2f(127.1, 311.7)));
  
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn water_color(depth: f32, worldPos: vec2f, time: f32) -> vec4f {
  // Base water colors
  let shallowColor = vec3f(0.2, 0.5, 0.7);  // Light blue
  let deepColor = vec3f(0.05, 0.2, 0.4);    // Dark blue
  
  // Animate water surface with multiple noise octaves
  let wave1 = noise2d(worldPos * 0.01 + vec2f(time * 0.1, time * 0.05));
  let wave2 = noise2d(worldPos * 0.02 - vec2f(time * 0.07, time * 0.08));
  let wave3 = noise2d(worldPos * 0.04 + vec2f(time * 0.12, -time * 0.06));
  
  let wavePattern = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2) * 0.15;
  
  // Color varies with depth
  let depthFactor = clamp(depth * 5.0, 0.0, 1.0);
  var color = mix(shallowColor, deepColor, depthFactor);
  
  // Add subtle wave highlights
  color += vec3f(wavePattern * 0.3);
  
  // Alpha varies with depth - shallow water is more transparent
  // Deep water (depth > 0.2) becomes nearly opaque
  let alpha = clamp(0.4 + depthFactor * 0.6, 0.4, 0.95);
  
  return vec4f(color, alpha);
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
  let waterLevel = uniforms.c3.y;
  let time = uniforms.c3.z;

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

  // Check if this fragment is underwater
  let waterDepth = waterLevel - h;
  
  // Define shoreline transition zone
  let shorelineWidth = 0.02; // Width of the transition zone
  let shoreColor = vec3f(0.4, 0.3, 0.2); // Brown/muddy shore color
  
  if (waterDepth > 0.0) {
    // This fragment is underwater
    let terrainColor = base_color(h) * lighting;
    
    // Calculate shore factor (0 = deep water, 1 = at water's edge)
    let shoreFactor = clamp(1.0 - (waterDepth / shorelineWidth), 0.0, 1.0);
    
    // Get water color
    let waterCol = water_color(waterDepth, wrapped, time);
    
    // Blend shore color into the mix near the water's edge
    let shoreBlend = mix(waterCol.rgb, shoreColor, shoreFactor * 0.6);
    
    // Adjust water alpha based on shore proximity (more transparent near shore)
    let adjustedAlpha = waterCol.a * (1.0 - shoreFactor * 0.3);
    
    // Final blend: terrain -> shore -> water
    let finalColor = mix(terrainColor, shoreBlend, adjustedAlpha);
    return vec4f(finalColor, 1.0);
  } else if (waterDepth > -shorelineWidth) {
    // This fragment is just above water (wet shore)
    let terrainColor = base_color(h) * lighting;
    
    // Calculate how close we are to water level (0 = far from water, 1 = at water's edge)
    let wetFactor = clamp(1.0 + (waterDepth / shorelineWidth), 0.0, 1.0);
    
    // Darken and add brown tint to create wet sand/mud effect
    let wetShoreColor = mix(terrainColor, shoreColor, wetFactor * 0.5);
    let darkenedColor = wetShoreColor * (1.0 - wetFactor * 0.2);
    
    return vec4f(darkenedColor, 1.0);
  } else {
    // Above water - render terrain normally
    let color = base_color(h) * lighting;
    return vec4f(color, 1.0);
  }
}
