export interface CircleObstacle {
  id: string;
  kind: 'pillar';
  x: number;
  z: number;
  minY?: number;
  radius: number;
  height: number;
  blocksCamera: boolean;
}

export interface BoxObstacle {
  id: string;
  kind: 'wood_barrier' | 'crate_stack' | 'stone_railing';
  x: number;
  z: number;
  minY?: number;
  halfWidth: number;
  halfDepth: number;
  height: number;
  rotationY: number;
  blocksCamera: boolean;
}

export interface ElevatedPlatform {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number; // Walkable upper deck elevation (4.0m)
}

export interface StairRamp {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  zLow: number; // Z coordinate at bottomY (0.0m)
  zHigh: number; // Z coordinate at topY (4.0m)
  bottomY: number;
  topY: number;
  entryZ: number; // AI approach waypoint outside bottom step
  exitZ: number; // AI landing waypoint past top step
}

export interface SpawnPoint {
  index: number;
  x: number;
  y?: number;
  z: number;
  yaw: number;
}

export interface TorchMount {
  x: number;
  y: number;
  z: number;
  inwardAngle: number;
}

export interface BannerMount {
  x: number;
  y: number;
  z: number;
  inwardAngle: number;
  color: number;
}

export interface ArenaConfig {
  radius: number; // Outer bounding radius (29m) enclosing the 44m x 44m Grand Courtyard
  boundsHalfX: number; // 21.3m inner stone fortress wall X half-extent
  boundsHalfZ: number; // 21.3m inner stone fortress wall Z half-extent
  tierHeight: number; // 4.0m Second-Tier Skybridge & Bastion height
  wallHeight: number;
  wallThickness: number;
  platforms: ElevatedPlatform[];
  stairs: StairRamp[];
  spawns: SpawnPoint[];
  circles: CircleObstacle[];
  boxes: BoxObstacle[];
  torches: TorchMount[];
  banners: BannerMount[];
}

function buildArenaConfig(): ArenaConfig {
  const boundsHalfX = 21.3;
  const boundsHalfZ = 21.3;
  const radius = 29.0; // Encloses the 44m x 44m walled citadel courtyard
  const tierHeight = 4.0;
  const wallHeight = 8.0; // Two-story 8m KayKit castle walls
  const wallThickness = 1.0;

  // TIER 2 ELEVATED PLATFORMS (y = 4.0m) — Walkable on top AND open underneath (y = 0.0m)!
  const platforms: ElevatedPlatform[] = [
    // Central 20m-long x 8m-wide Timber & Stone Skybridge spanning West <-> East
    {
      id: 'bridge_center',
      minX: -10.0,
      maxX: 10.0,
      minZ: -4.0,
      maxZ: 4.0,
      topY: tierHeight,
    },
    // West Elevated Bastion Terrace
    {
      id: 'bastion_west',
      minX: -18.0,
      maxX: -10.0,
      minZ: -6.0,
      maxZ: 6.0,
      topY: tierHeight,
    },
    // East Elevated Bastion Terrace
    {
      id: 'bastion_east',
      minX: 10.0,
      maxX: 18.0,
      minZ: -6.0,
      maxZ: 6.0,
      topY: tierHeight,
    },
  ];

  // FOUR WIDE STONE STAIRCASES (stairs_wide.gltf.glb: 5.0m walkable stone steps between 1.0m side balustrades)
  // Step profile calibrated against stairs_wide.gltf.glb triangles:
  //   first step at z = ±10.00 sits at y = 0.38m -> zLow = ±10.38 rises smoothly from y = 0.0m,
  //   reaching y = 4.00m at zHigh = ±6.22 with a flat y = 4.00m top landing overlapping the Bastions!
  const stairs: StairRamp[] = [
    {
      id: 'stairs_nw',
      minX: -17.0,
      maxX: -11.0,
      minZ: -10.45,
      maxZ: -5.65,
      zLow: -10.38,
      zHigh: -6.22,
      bottomY: 0,
      topY: tierHeight,
      entryZ: -11.4,
      exitZ: -4.6,
    },
    {
      id: 'stairs_sw',
      minX: -17.0,
      maxX: -11.0,
      minZ: 5.65,
      maxZ: 10.45,
      zLow: 10.38,
      zHigh: 6.22,
      bottomY: 0,
      topY: tierHeight,
      entryZ: 11.4,
      exitZ: 4.6,
    },
    {
      id: 'stairs_ne',
      minX: 11.0,
      maxX: 17.0,
      minZ: -10.45,
      maxZ: -5.65,
      zLow: -10.38,
      zHigh: -6.22,
      bottomY: 0,
      topY: tierHeight,
      entryZ: -11.4,
      exitZ: -4.6,
    },
    {
      id: 'stairs_se',
      minX: 11.0,
      maxX: 17.0,
      minZ: 5.65,
      maxZ: 10.45,
      zLow: 10.38,
      zHigh: 6.22,
      bottomY: 0,
      topY: tierHeight,
      entryZ: 11.4,
      exitZ: 4.6,
    },
  ];

  // 5 Symmetrical Multi-Tier Spawns (3 in Lower Courtyard y=0, 2 on Upper Skybridge Bastions y=4!)
  const spawns: SpawnPoint[] = [
    // 0: South Lower Courtyard facing the Skybridge
    { index: 0, x: 0.0, y: 0.0, z: 14.5, yaw: Math.PI },
    // 1: West Upper Bastion (y = 4.0m) overlooking the Skybridge!
    { index: 1, x: -13.5, y: tierHeight, z: 0.0, yaw: Math.PI * 0.5 },
    // 2: East Upper Bastion (y = 4.0m) overlooking the Skybridge!
    { index: 2, x: 13.5, y: tierHeight, z: 0.0, yaw: -Math.PI * 0.5 },
    // 3: North-West Lower Courtyard
    { index: 3, x: -7.5, y: 0.0, z: -14.5, yaw: 0.45 },
    // 4: North-East Lower Courtyard
    { index: 4, x: 7.5, y: 0.0, z: -14.5, yaw: -0.45 },
  ];

  // Stone Columns supporting the Skybridge & Bastions on Tier 1 (height = 4.0m, so Tier 2 walks right over!)
  // plus tall Courtyard Columns (height = 8.0m)
  const circles: CircleObstacle[] = [
    // 4 Courtyard / Bridge Pier Columns (circles[0] used by pillar occlusion tests at y=0!)
    {
      id: 'pillar_bridge_nw',
      kind: 'pillar',
      x: -6.0,
      z: -3.6,
      minY: 0,
      radius: 0.76,
      height: 3.95,
      blocksCamera: true,
    },
    {
      id: 'pillar_bridge_ne',
      kind: 'pillar',
      x: 6.0,
      z: -3.6,
      minY: 0,
      radius: 0.76,
      height: 3.95,
      blocksCamera: true,
    },
    {
      id: 'pillar_bridge_sw',
      kind: 'pillar',
      x: -6.0,
      z: 3.6,
      minY: 0,
      radius: 0.76,
      height: 3.95,
      blocksCamera: true,
    },
    {
      id: 'pillar_bridge_se',
      kind: 'pillar',
      x: 6.0,
      z: 3.6,
      minY: 0,
      radius: 0.76,
      height: 3.95,
      blocksCamera: true,
    },
    // 4 Tall Outer Courtyard Columns
    {
      id: 'pillar_court_nw',
      kind: 'pillar',
      x: -6.5,
      z: -11.5,
      minY: 0,
      radius: 0.78,
      height: 8.0,
      blocksCamera: true,
    },
    {
      id: 'pillar_court_ne',
      kind: 'pillar',
      x: 6.5,
      z: -11.5,
      minY: 0,
      radius: 0.78,
      height: 8.0,
      blocksCamera: true,
    },
    {
      id: 'pillar_court_sw',
      kind: 'pillar',
      x: -6.5,
      z: 11.5,
      minY: 0,
      radius: 0.78,
      height: 8.0,
      blocksCamera: true,
    },
    {
      id: 'pillar_court_se',
      kind: 'pillar',
      x: 6.5,
      z: 11.5,
      minY: 0,
      radius: 0.78,
      height: 8.0,
      blocksCamera: true,
    },
  ];

  // Box Obstacles:
  // - Tier 1 low barriers, crates & staircase side-balustrades (minY = 0)
  // - Tier 2 Skybridge & Bastion parapet railings (minY = 4.0) with dramatic central drop-off gap!
  const boxes: BoxObstacle[] = [
    // Solid Stone Masonry Bases of West & East Bastion Keeps (Tier 1 only: height = 3.2m so stairs & Tier 2 never snag!)
    {
      id: 'bastion_base_west',
      kind: 'stone_railing',
      x: -14.0,
      z: 0.0,
      minY: 0,
      halfWidth: 3.98,
      halfDepth: 5.55,
      height: 3.2,
      rotationY: 0,
      blocksCamera: true,
    },
    {
      id: 'bastion_base_east',
      kind: 'stone_railing',
      x: 14.0,
      z: 0.0,
      minY: 0,
      halfWidth: 3.98,
      halfDepth: 5.55,
      height: 3.2,
      rotationY: 0,
      blocksCamera: true,
    },

    // Tier 1 Courtyard Barriers & Supply Clusters
    {
      id: 'court_barrier_north',
      kind: 'wood_barrier',
      x: 0.0,
      z: -10.0,
      minY: 0,
      halfWidth: 2.0,
      halfDepth: 0.35,
      height: 1.15,
      rotationY: 0,
      blocksCamera: false,
    },
    {
      id: 'court_barrier_south_w',
      kind: 'wood_barrier',
      x: -4.2,
      z: 9.5,
      minY: 0,
      halfWidth: 1.9,
      halfDepth: 0.35,
      height: 1.15,
      rotationY: 0.25,
      blocksCamera: false,
    },
    {
      id: 'court_barrier_south_e',
      kind: 'wood_barrier',
      x: 4.2,
      z: 9.5,
      minY: 0,
      halfWidth: 1.9,
      halfDepth: 0.35,
      height: 1.15,
      rotationY: -0.25,
      blocksCamera: false,
    },
    {
      id: 'court_crates_north',
      kind: 'crate_stack',
      x: 0.0,
      z: -18.5,
      minY: 0,
      halfWidth: 1.6,
      halfDepth: 1.1,
      height: 2.1,
      rotationY: 0,
      blocksCamera: false,
    },

    // Staircase Side-Balustrade Walls matching exact 1.0m stone balustrades of stairs_wide.gltf.glb
    // (x = ±17.0 and x = ±11.0, z = ±8.0, height = 4.85m — blocks both lower-courtyard side entry AND falling sideways off stairs!)
    ...[
      [-17.0, -8.02],
      [-11.0, -8.02],
      [-17.0, 8.02],
      [-11.0, 8.02],
      [11.0, -8.02],
      [17.0, -8.02],
      [11.0, 8.02],
      [17.0, 8.02],
    ].map(([sx, sz], i) => ({
      id: `stair_side_${i}`,
      kind: 'stone_railing' as const,
      x: sx,
      z: sz,
      minY: 0,
      halfWidth: 0.48,
      halfDepth: 2.02,
      height: 4.85,
      rotationY: 0,
      blocksCamera: false,
    })),

    // TIER 2 SKYBRIDGE PARAPET RAILINGS (minY = 4.0m)
    // Leaves a thrilling 4.4m open center drop-zone (x in [-2.2 .. +2.2]) in the middle of the bridge!
    {
      id: 'bridge_rail_nw',
      kind: 'stone_railing',
      x: -6.05,
      z: -3.92,
      minY: tierHeight,
      halfWidth: 3.85,
      halfDepth: 0.22,
      height: 1.2,
      rotationY: 0,
      blocksCamera: false,
    },
    {
      id: 'bridge_rail_ne',
      kind: 'stone_railing',
      x: 6.05,
      z: -3.92,
      minY: tierHeight,
      halfWidth: 3.85,
      halfDepth: 0.22,
      height: 1.2,
      rotationY: 0,
      blocksCamera: false,
    },
    {
      id: 'bridge_rail_sw',
      kind: 'stone_railing',
      x: -6.05,
      z: 3.92,
      minY: tierHeight,
      halfWidth: 3.85,
      halfDepth: 0.22,
      height: 1.2,
      rotationY: 0,
      blocksCamera: false,
    },
    {
      id: 'bridge_rail_se',
      kind: 'stone_railing',
      x: 6.05,
      z: 3.92,
      minY: tierHeight,
      halfWidth: 3.85,
      halfDepth: 0.22,
      height: 1.2,
      rotationY: 0,
      blocksCamera: false,
    },

    // TIER 2 BASTION INNER WING PARAPETS (smoothly funneling the 12m Bastion into the 8m Skybridge!)
    ...[
      [-10.05, -5.02],
      [-10.05, 5.02],
      [10.05, -5.02],
      [10.05, 5.02],
    ].map(([wx, wz], i) => ({
      id: `bastion_wing_${i}`,
      kind: 'stone_railing' as const,
      x: wx,
      z: wz,
      minY: tierHeight,
      halfWidth: 0.22,
      halfDepth: 0.96,
      height: 1.2,
      rotationY: 0,
      blocksCamera: false,
    })),

    // TIER 2 BASTION OUTER BACK RAILINGS (minY = 4.0m)
    {
      id: 'bastion_rail_west',
      kind: 'stone_railing',
      x: -17.85,
      z: 0.0,
      minY: tierHeight,
      halfWidth: 0.3,
      halfDepth: 5.8,
      height: 1.25,
      rotationY: 0,
      blocksCamera: false,
    },
    {
      id: 'bastion_rail_east',
      kind: 'stone_railing',
      x: 17.85,
      z: 0.0,
      minY: tierHeight,
      halfWidth: 0.3,
      halfDepth: 5.8,
      height: 1.25,
      rotationY: 0,
      blocksCamera: false,
    },
  ];

  // Wall-mounted Torches & Heraldic Banners around the 44m x 44m Fortress Perimeter + Bridge!
  const torches: TorchMount[] = [];
  const banners: BannerMount[] = [];
  const bannerPalette = [0xc93838, 0x2979c9, 0xe0a82e, 0x2f8f4e];

  const wallPosCoords = [-16, -8, 0, 8, 16];
  wallPosCoords.forEach((coord, i) => {
    // North Wall (z = -21.5, facing +Z = 0)
    torches.push({ x: coord - 2, y: 3.2, z: -21.45, inwardAngle: 0 });
    banners.push({
      x: coord + 2,
      y: 4.5,
      z: -21.45,
      inwardAngle: 0,
      color: bannerPalette[i % bannerPalette.length],
    });

    // South Wall (z = +21.5, facing -Z = PI)
    torches.push({ x: coord + 2, y: 3.2, z: 21.45, inwardAngle: Math.PI });
    banners.push({
      x: coord - 2,
      y: 4.5,
      z: 21.45,
      inwardAngle: Math.PI,
      color: bannerPalette[(i + 1) % bannerPalette.length],
    });

    // West Wall (x = -21.5, facing +X = PI/2)
    torches.push({
      x: -21.45,
      y: 5.6,
      z: coord,
      inwardAngle: Math.PI * 0.5,
    });

    // East Wall (x = +21.5, facing -X = -PI/2)
    torches.push({
      x: 21.45,
      y: 5.6,
      z: coord,
      inwardAngle: -Math.PI * 0.5,
    });
  });

  // Bridge Center Drop-Zone Torches at y = 4.6m!
  for (const bx of [-2.4, 2.4]) {
    torches.push({ x: bx, y: 4.85, z: -3.75, inwardAngle: 0 });
    torches.push({ x: bx, y: 4.85, z: 3.75, inwardAngle: Math.PI });
  }

  return {
    radius,
    boundsHalfX,
    boundsHalfZ,
    tierHeight,
    wallHeight,
    wallThickness,
    platforms,
    stairs,
    spawns,
    circles,
    boxes,
    torches,
    banners,
  };
}

export const ARENA_CONFIG: ArenaConfig = buildArenaConfig();
