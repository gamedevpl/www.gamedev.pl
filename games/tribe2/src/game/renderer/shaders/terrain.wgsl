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

// Cartoon water effect - slow, peaceful, zoom-dependent
fn cartoon_water(worldPos: vec2f, depth: f32, time: f32, zoom: f32) -> vec4f {
  // Water colors - cartoon style with clear distinction
  let shallowColor = vec3f(0.4, 0.7, 0.9);  // Light blue
  let deepColor = vec3f(0.1, 0.3, 0.6);     // Dark blue
  let foamColor = vec3f(0.9, 0.95, 1.0);    // White foam
  
  // Animation speed - slow and peaceful
  let animSpeed = 0.3;
  let slowTime = time * animSpeed;
  
  // Base color based on depth
  let depthFactor = clamp(depth * 8.0, 0.0, 1.0);
  var waterColor = mix(shallowColor, deepColor, depthFactor);
  
  // Zoom-dependent detail level
  // At low zoom (zoomed out), water is flat and simple
  // At high zoom (zoomed in), water shows wave patterns
  let detailLevel = clamp((zoom - 0.5) / 2.5, 0.0, 1.0); // 0 at zoom=0.5, 1 at zoom=3.0
  
  if (detailLevel > 0.01) {
    // Slow, gentle wave patterns using simple sine waves
    let wave1 = sin(worldPos.x * 0.005 + slowTime * 0.5) * cos(worldPos.y * 0.004 + slowTime * 0.3);
    let wave2 = sin(worldPos.x * 0.008 - slowTime * 0.4) * sin(worldPos.y * 0.007 + slowTime * 0.6);
    let wave3 = cos(worldPos.x * 0.003 + worldPos.y * 0.003 + slowTime * 0.7);
    
    // Combine waves with varying amplitudes
    let wavePattern = (wave1 * 0.4 + wave2 * 0.3 + wave3 * 0.3);
    
    // Apply wave pattern as subtle color variation (scaled by detail level)
    let waveInfluence = wavePattern * 0.25 * detailLevel; // Increased influence
    waterColor += vec3f(waveInfluence);
    
    // Add gentle highlights in wave peaks
    let highlight = smoothstep(0.3, 0.6, wavePattern) * 0.3 * detailLevel; // Increased influence
    waterColor += vec3f(highlight);
  }
  
  // Stylized foam at shoreline
  let foamWidth = 0.03;
  let foamFactor = smoothstep(foamWidth, 0.0, depth);
  
  // Animate foam with slow pulsing
  let foamPulse = 0.5 + 0.5 * sin(slowTime * 2.0);
  let animatedFoam = foamFactor * (0.7 + 0.3 * foamPulse);
  
  // Blend foam into water color
  waterColor = mix(waterColor, foamColor, animatedFoam * 0.8);
  
  // Clamp color to valid range
  waterColor = clamp(waterColor, vec3f(0.0), vec3f(1.0));
  
  // Alpha varies with depth - shallow water is more transparent
  let alpha = clamp(0.3 + depthFactor * 0.5, 0.3, 0.8); // More transparent
  
  return vec4f(waterColor, alpha);
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
    // --- Refraction Effect ---
    let animSpeed = 0.3;
    let slowTime = time * animSpeed;
    let wave_deriv_x = cos(wrapped.x * 0.005 + slowTime * 0.5) * 0.005;
    let wave_deriv_y = -sin(wrapped.y * 0.004 + slowTime * 0.3) * 0.004;
    let refractionStrength = 40.0 * waterDepth * clamp(zoom, 0.5, 2.0);
    let refractionOffset = vec2f(wave_deriv_x, wave_deriv_y) * refractionStrength;
    let refracted_uv = uv + refractionOffset / gridSize;
    
    // Sample underlying terrain with refraction
    let h_refracted = textureSampleLevel(heightTex, heightSampler, refracted_uv, 0.0).x;
    let hx1_r = textureSampleLevel(heightTex, heightSampler, fract(refracted_uv + du), 0.0).x;
    let hx0_r = textureSampleLevel(heightTex, heightSampler, fract(refracted_uv - du), 0.0).x;
    let hy1_r = textureSampleLevel(heightTex, heightSampler, fract(refracted_uv + dv), 0.0).x;
    let hy0_r = textureSampleLevel(heightTex, heightSampler, fract(refracted_uv - dv), 0.0).x;
    let dzdx_r = (hx1_r - hx0_r) * heightScale / (2.0 * cellSize);
    let dzdy_r = (hy1_r - hy0_r) * heightScale / (2.0 * cellSize);
    let n_r = normalize(vec3f(-dzdx_r, -dzdy_r, 1.0));
    let ndl_r = max(dot(n_r, lightDir), 0.0);
    let lighting_r = ambient + (1.0 - ambient) * ndl_r;
    let terrainColor = base_color(h_refracted) * lighting_r;
    
    // Get cartoon water color
    let waterCol = cartoon_water(wrapped, waterDepth, time, zoom);
    
    // Calculate shore factor for wet sand effect
    let shoreFactor = clamp(1.0 - (waterDepth / shorelineWidth), 0.0, 1.0);
    
    // Blend shore color near the water's edge
    let shoreBlend = mix(waterCol.rgb, shoreColor, shoreFactor * 0.4);
    
    // Final blend: terrain -> water
    let finalColor = mix(terrainColor, shoreBlend, waterCol.a);
    
    return vec4f(finalColor, 1.0);
  } else if (waterDepth > -shorelineWidth) {
    // This fragment is just above water (wet shore)
    let terrainColor = base_color(h) * lighting;
    
    // Calculate how close we are to water level
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
