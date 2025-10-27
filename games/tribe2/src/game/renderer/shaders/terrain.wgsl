// Terrain rendering shader for 3D mesh (WGSL)

struct Uniforms {
  // c0: center.x, center.y, zoom, unused
  c0: vec4f,
  // c1: canvasSize.x, canvasSize.y, mapSize.x, mapSize.y (map size in world units)
  c1: vec4f,
  // c2: lightDir.x, lightDir.y, lightDir.z, heightScale
  c2: vec4f,
  // c3: ambient, waterLevel, time, unused
  c3: vec4f,
  // c4: GROUND.rgb, SAND.r
  c4: vec4f,
  // c5: SAND.gb, GRASS.rg
  c5: vec4f,
  // c6: GRASS.b, ROCK.rgb
  c6: vec4f,
  // c7: SNOW.rgb, padding
  c7: vec4f,
  // c8: displacementFactor, unused, unused, unused
  c8: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) biome: f32,
};

struct VSOutput {
  @builtin(position) clip_position: vec4f,
  @location(0) world_pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) biome_value: f32,
};

@vertex
fn vs_main(@builtin(instance_index) instance_idx: u32, in: VSInput) -> VSOutput {
  var out: VSOutput;
  let center = uniforms.c0.xy;
  let zoom = uniforms.c0.z;
  let canvas_size = uniforms.c1.xy;
  let map_size = uniforms.c1.zw;

  // Calculate which tile the camera is in (using floor for precise integer division)
  let camera_tile = floor(center / map_size);
  
  // Calculate this instance's relative tile position in the 3x3 grid
  let tile_x = f32(instance_idx % 3u) - 1.0;
  let tile_y = f32(instance_idx / 3u) - 1.0;
  
  // Calculate this instance's absolute tile position
  let instance_tile = camera_tile + vec2f(tile_x, tile_y);
  
  // Calculate the world position for this vertex
  // The vertex's base position is already in [0, map_size] range
  let instanced_world_pos = vec3f(
    in.position.xy + instance_tile * map_size,
    in.position.z
  );

  // Delta from camera to this vertex's instanced position
  let delta = instanced_world_pos.xy - center;
  
  // To NDC
  let screen_pos = delta * zoom;
  let ndc_pos = screen_pos / (canvas_size * 0.5);

  out.clip_position = vec4f(ndc_pos.x, ndc_pos.y, (instanced_world_pos.z / uniforms.c2.w) * uniforms.c8.x, 1.0);
  out.world_pos = instanced_world_pos;
  out.normal = in.normal;
  out.biome_value = in.biome;

  return out;
}

// Decodes biome colors from the uniform buffer with interpolation
// biomeValue is a normalized float [0, 1]
fn getBiomeColor(biomeValue: f32) -> vec3f {
  let scaledValue = biomeValue * 4.0;
  let biomeId0 = u32(floor(scaledValue));
  let biomeId1 = u32(ceil(scaledValue));
  let t = fract(scaledValue);
  
  var color0: vec3f;
  var color1: vec3f;
  
  switch (biomeId0) {
    case 0u: { color0 = uniforms.c4.xyz; } // Ground
    case 1u: { color0 = vec3f(uniforms.c4.w, uniforms.c5.x, uniforms.c5.y); } // Sand
    case 2u: { color0 = vec3f(uniforms.c5.z, uniforms.c5.w, uniforms.c6.x); } // Grass
    case 3u: { color0 = uniforms.c6.yzw; } // Rock
    default: { color0 = uniforms.c7.xyz; } // Snow
  }
  
  switch (biomeId1) {
    case 0u: { color1 = uniforms.c4.xyz; }
    case 1u: { color1 = vec3f(uniforms.c4.w, uniforms.c5.x, uniforms.c5.y); }
    case 2u: { color1 = vec3f(uniforms.c5.z, uniforms.c5.w, uniforms.c6.x); }
    case 3u: { color1 = uniforms.c6.yzw; }
    default: { color1 = uniforms.c7.xyz; }
  }
  
  return mix(color0, color1, t);
}

// Cartoon water effect - slow, peaceful, zoom-dependent
fn cartoon_water(worldPos: vec2f, depth: f32, time: f32, zoom: f32) -> vec4f {
  let shallowColor = vec3f(0.4, 0.7, 0.9);
  let deepColor = vec3f(0.1, 0.3, 0.6);
  let foamColor = vec3f(0.9, 0.95, 1.0);
  let animSpeed = 0.3;
  let slowTime = time * animSpeed;
  
  let depthFactor = clamp(depth * 8.0, 0.0, 1.0);
  var waterColor = mix(shallowColor, deepColor, depthFactor);
  
  let detailLevel = clamp((zoom - 0.5) / 2.5, 0.0, 1.0);
  
  if (detailLevel > 0.01) {
    let wave1 = sin(worldPos.x * 0.005 + slowTime * 0.5) * cos(worldPos.y * 0.004 + slowTime * 0.3);
    let wave2 = sin(worldPos.x * 0.008 - slowTime * 0.4) * sin(worldPos.y * 0.007 + slowTime * 0.6);
    let wavePattern = (wave1 * 0.5 + wave2 * 0.5);
    waterColor += vec3f(wavePattern * 0.15 * detailLevel);
    let highlight = smoothstep(0.4, 0.6, wavePattern) * 0.2 * detailLevel;
    waterColor += vec3f(highlight);
  }
  
  let foamWidth = 0.03;
  let foamFactor = smoothstep(foamWidth, 0.0, depth);
  let foamPulse = 0.5 + 0.5 * sin(slowTime * 2.0);
  let animatedFoam = foamFactor * (0.7 + 0.3 * foamPulse);
  
  waterColor = mix(waterColor, foamColor, animatedFoam * 0.8);
  waterColor = clamp(waterColor, vec3f(0.0), vec3f(1.0));
  
  let alpha = clamp(0.3 + depthFactor * 0.5, 0.3, 0.8);
  return vec4f(waterColor, alpha);
}

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4f {
  let lightDir = normalize(uniforms.c2.xyz);
  let heightScale = uniforms.c2.w;
  let ambient = uniforms.c3.x;
  let waterLevel = uniforms.c3.y;
  let time = uniforms.c3.z;
  let zoom = uniforms.c0.z;

  // Lambertian lighting using interpolated normal
  let ndl = max(dot(in.normal, lightDir), 0.0);
  let lighting = ambient + (1.0 - ambient) * ndl;

  // Get base color from interpolated biome value
  let baseColor = getBiomeColor(in.biome_value);
  let terrainColor = baseColor * lighting;

  // Check if this fragment is underwater
  let height = in.world_pos.z / heightScale;
  let waterDepth = waterLevel - height;
  let shorelineWidth = 0.02;
  let shoreColor = vec3f(0.4, 0.3, 0.2); // Brown/muddy shore color

  if (waterDepth > 0.0) {
    let waterCol = cartoon_water(in.world_pos.xy, waterDepth, time, zoom);
    let shoreFactor = clamp(1.0 - (waterDepth / shorelineWidth), 0.0, 1.0);
    let shoreBlend = mix(waterCol.rgb, shoreColor, shoreFactor * 0.4);
    let finalColor = mix(terrainColor, shoreBlend, waterCol.a);
    return vec4f(finalColor, 1.0);
  } else if (waterDepth > -shorelineWidth) {
    // Wet shore effect
    let wetFactor = clamp(1.0 + (waterDepth / shorelineWidth), 0.0, 1.0);
    let wetShoreColor = mix(terrainColor, shoreColor, wetFactor * 0.5);
    let darkenedColor = wetShoreColor * (1.0 - wetFactor * 0.2);
    return vec4f(darkenedColor, 1.0);
  } else {
    // Above water
    return vec4f(terrainColor, 1.0);
  }
}
