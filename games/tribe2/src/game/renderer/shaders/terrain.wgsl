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
  // c8: displacementFactor, cellSize, unused, unused
  c8: vec4f,
  // c9: ROAD_COLOR.rgb, ROAD_COAST_COLOR.r
  c9: vec4f,
  // c10: ROAD_COAST_COLOR.gb, ROAD_COAST_WIDTH, ROAD_WIDTH
  c10: vec4f,
  // c11: windNoiseScale, windTimeScale, windStrengthGrass, windStrengthWater
  c11: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var roadTexture: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

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

// Hash function for pseudo-random number generation
fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.13);
  p3 += dot(p3, p3.yzx + 3.333);
  return fract((p3.x + p3.y) * p3.z);
}

// 2D Simplex-like noise function (optimized for performance)
fn snoise(v: vec2f) -> f32 {
  let C = vec4f(
    0.211324865405187,  // (3.0-sqrt(3.0))/6.0
    0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
    -0.577350269189626, // -1.0 + 2.0 * C.x
    0.024390243902439   // 1.0 / 41.0
  );

  // First corner
  var i = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);

  // Other corners
  var i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4f(x12.xy - i1, x12.zw);

  // Permutations
  i = i - floor(i * (1.0 / 289.0)) * 289.0; // mod(i, 289.0)
  let p = vec3f(
    hash(i),
    hash(i + i1),
    hash(i + vec2f(1.0, 1.0))
  );

  var m = max(0.5 - vec3f(
    dot(x0, x0),
    dot(x12.xy, x12.xy),
    dot(x12.zw, x12.zw)
  ), vec3f(0.0));
  m = m * m;
  m = m * m;

  // Gradients
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;

  // Normalize gradients
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  // Compute final noise value
  let g = vec3f(
    a0.x * x0.x + h.x * x0.y,
    a0.y * x12.x + h.y * x12.y,
    a0.z * x12.z + h.z * x12.w
  );
  
  return 130.0 * dot(m, g);
}

// Generate wind vector at a given world position and time
// Returns vec2f with wind direction and strength encoded as a 2D vector
fn getWindVector(worldPos: vec2f, time: f32, windNoiseScale: f32, windTimeScale: f32) -> vec2f {
  let windTime = time * windTimeScale;
  
  // First octave - large scale wind patterns
  let p1 = worldPos * windNoiseScale;
  let n1x = snoise(p1 + vec2f(windTime, 0.0));
  let n1y = snoise(p1 + vec2f(0.0, windTime));
  
  // Second octave - smaller detail
  let p2 = worldPos * windNoiseScale * 2.5;
  let n2x = snoise(p2 + vec2f(windTime * 1.3, windTime * 0.7));
  let n2y = snoise(p2 + vec2f(windTime * 0.7, windTime * 1.3));
  
  // Combine octaves with different weights
  let windX = n1x * 0.7 + n2x * 0.3;
  let windY = n1y * 0.7 + n2y * 0.3;
  
  return vec2f(windX, windY);
}

// Cartoon water effect with wind influence
fn cartoon_water(worldPos: vec2f, depth: f32, time: f32, zoom: f32, windVec: vec2f, windStrength: f32) -> vec4f {
  let shallowColor = vec3f(0.4, 0.7, 0.9);
  let deepColor = vec3f(0.1, 0.3, 0.6);
  let foamColor = vec3f(0.9, 0.95, 1.0);
  let animSpeed = 0.3;
  let slowTime = time * animSpeed;
  
  // Apply wind displacement to the water position
  let windOffset = windVec * windStrength;
  let windWorldPos = worldPos + windOffset;
  
  let depthFactor = clamp(depth * 8.0, 0.0, 1.0);
  var waterColor = mix(shallowColor, deepColor, depthFactor);
  
  let detailLevel = clamp((zoom - 0.5) / 2.5, 0.0, 1.0);
  
  if (detailLevel > 0.01) {
    // Use wind-displaced position for wave calculations
    let wave1 = sin(windWorldPos.x * 0.005 + slowTime * 0.5) * cos(windWorldPos.y * 0.004 + slowTime * 0.3);
    let wave2 = sin(windWorldPos.x * 0.008 - slowTime * 0.4) * sin(windWorldPos.y * 0.007 + slowTime * 0.6);
    
    // Add directional wave component based on wind
    let windDir = normalize(windVec);
    let windAlignedCoord = dot(windWorldPos, windDir);
    let windWave = sin(windAlignedCoord * 0.003 + slowTime * 0.8) * length(windVec) * 0.5;
    
    let wavePattern = (wave1 * 0.4 + wave2 * 0.4 + windWave * 0.2);
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
  let map_size = uniforms.c1.zw;
  
  // Wind parameters
  let windNoiseScale = uniforms.c11.x;
  let windTimeScale = uniforms.c11.y;
  let windStrengthGrass = uniforms.c11.z;
  let windStrengthWater = uniforms.c11.w;

  // Calculate wind vector for this fragment
  let windVec = getWindVector(in.world_pos.xy, time, windNoiseScale, windTimeScale);

  // Lambertian lighting using interpolated normal
  let ndl = max(dot(in.normal, lightDir), 0.0);
  let lighting = ambient + (1.0 - ambient) * ndl;

  // Get base color from interpolated biome value
  let baseColor = getBiomeColor(in.biome_value);
  let terrainColor = baseColor * lighting;
  var finalColor = terrainColor;
  
  // Apply wind effect to grass (biome value around 0.5, which is grass)
  let grassBiomeValue = 0.5; // Grass is biome ID 2, normalized to 0.5
  let grassFactor = 1.0 - clamp(abs(in.biome_value - grassBiomeValue) * 8.0, 0.0, 1.0);
  
  if (grassFactor > 0.1) {
    // Calculate wind strength and direction for grass effect
    let windStrength = length(windVec);
    let windDir = normalize(windVec);
    
    // Create subtle color variation based on wind
    let grassWindEffect = sin(dot(in.world_pos.xy, windDir) * 0.02 + time * windTimeScale * 10.0) * windStrength;
    let grassModulation = grassWindEffect * windStrengthGrass * grassFactor;
    
    // Apply subtle darkening/lightening to simulate grass bending
    finalColor = finalColor * (1.0 + grassModulation);
  }

  // --- Road Rendering ---
  let texCoord = in.world_pos.xy / map_size;
  let roadData = textureSample(roadTexture, linearSampler, texCoord);

  if (roadData.a > 0.01) {
      let roadStrength = roadData.a;
      
      let roadColor = uniforms.c9.xyz;
      let roadCoastColor = vec3f(uniforms.c9.w, uniforms.c10.x, uniforms.c10.y);

      let coastFactor = smoothstep(0.1, 0.5, roadStrength);
      let roadFactor = smoothstep(0.5, 0.8, roadStrength);

      let litRoad = roadColor * lighting;
      let litCoast = roadCoastColor * lighting;
      
      let roadSurface = mix(litCoast, litRoad, roadFactor);
      finalColor = mix(finalColor, roadSurface, coastFactor);
  }

  // Check if this fragment is underwater
  let height = in.world_pos.z / heightScale;
  let waterDepth = waterLevel - height;
  let shorelineWidth = 0.02;
  let shoreColor = vec3f(0.4, 0.3, 0.2);

  if (waterDepth > 0.0) {
    let waterCol = cartoon_water(in.world_pos.xy, waterDepth, time, zoom, windVec, windStrengthWater);
    let shoreFactor = clamp(1.0 - (waterDepth / shorelineWidth), 0.0, 1.0);
    let shoreBlend = mix(waterCol.rgb, shoreColor, shoreFactor * 0.4);
    finalColor = mix(terrainColor, shoreBlend, waterCol.a);
  } else if (waterDepth > -shorelineWidth) {
    // Wet shore effect
    let wetFactor = clamp(1.0 + (waterDepth / shorelineWidth), 0.0, 1.0);
    let wetShoreColor = mix(terrainColor, shoreColor, wetFactor * 0.5);
    finalColor = wetShoreColor * (1.0 - wetFactor * 0.2);
  }
  
  return vec4f(finalColor, 1.0);
}
