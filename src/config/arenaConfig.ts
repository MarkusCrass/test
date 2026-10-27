export interface CircleObstacle {
  id: string;
  kind: 'pillar';
  x: number;
  z: number;
  radius: number;
  height: number;
  blocksCamera: boolean;
}

export interface BoxObstacle {
  id: string;
  kind: 'wood_barrier' | 'crate_stack';
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  height: number;
  rotationY: number; // kept 0 or axis-aligned / oriented box
  blocksCamera: boolean;
}

export interface SpawnPoint {
  index: number;
  x: number;
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
  radius: number; // 14m => 28m diameter
  wallHeight: number;
  wallThickness: number;
  spawns: SpawnPoint[];
  circles: CircleObstacle[];
  boxes: BoxObstacle[];
  torches: TorchMount[];
  banners: BannerMount[];
}

function buildArenaConfig(): ArenaConfig {
  const radius = 14.0; // 28 meters diameter
  const wallHeight = 5.4;
  const wallThickness = 1.2;

  // 5 symmetrical spawn points facing the center of the arena
  const spawnRingRadius = 9.8;
  const spawns: SpawnPoint[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const x = Math.cos(angle) * spawnRingRadius;
    const z = Math.sin(angle) * spawnRingRadius;
    // Face inward toward (0, 0)
    const yaw = Math.atan2(-x, -z);
    spawns.push({ index: i, x, z, yaw });
  }

  // 4 stone columns placed at 45°, 135°, 225°, 315° at radius 7.4m
  // Checked not to overlap any of the 5 spawn points (-90°, -18°, 54°, 126°, 198° at r=9.8m)
  const pillarRadius = 0.72;
  const pillarRing = 7.2;
  const pillarAngles = [
    Math.PI * 0.25,
    Math.PI * 0.75,
    Math.PI * 1.25,
    Math.PI * 1.75,
  ];
  const circles: CircleObstacle[] = pillarAngles.map((a, idx) => ({
    id: `pillar_${idx}`,
    kind: 'pillar',
    x: Math.cos(a) * pillarRing,
    z: Math.sin(a) * pillarRing,
    radius: pillarRadius,
    height: 4.5,
    blocksCamera: true,
  }));

  // Low wooden structures / barricades (do not obstruct third-person overview!)
  const boxes: BoxObstacle[] = [
    {
      id: 'wood_north_west',
      kind: 'wood_barrier',
      x: -4.6,
      z: -1.8,
      halfWidth: 1.35,
      halfDepth: 0.36,
      height: 1.0,
      rotationY: 0.45,
      blocksCamera: false,
    },
    {
      id: 'wood_north_east',
      kind: 'wood_barrier',
      x: 4.6,
      z: -1.8,
      halfWidth: 1.35,
      halfDepth: 0.36,
      height: 1.0,
      rotationY: -0.45,
      blocksCamera: false,
    },
    {
      id: 'wood_south',
      kind: 'crate_stack',
      x: 0.0,
      z: 5.3,
      halfWidth: 1.1,
      halfDepth: 0.55,
      height: 1.05,
      rotationY: 0,
      blocksCamera: false,
    },
  ];

  // 8 wall torches & 8 colorful banners around perimeter
  const torches: TorchMount[] = [];
  const banners: BannerMount[] = [];
  const bannerPalette = [0xc93838, 0x2979c9, 0xe0a82e, 0x2f8f4e];

  for (let i = 0; i < 8; i++) {
    const tAngle = (i * Math.PI * 2) / 8;
    const tx = Math.cos(tAngle) * (radius - 0.32);
    const tz = Math.sin(tAngle) * (radius - 0.32);
    torches.push({
      x: tx,
      y: 3.1,
      z: tz,
      inwardAngle: Math.atan2(-tx, -tz),
    });

    const bAngle = tAngle + Math.PI / 8;
    const bx = Math.cos(bAngle) * (radius - 0.22);
    const bz = Math.sin(bAngle) * (radius - 0.22);
    banners.push({
      x: bx,
      y: 3.85,
      z: bz,
      inwardAngle: Math.atan2(-bx, -bz),
      color: bannerPalette[i % bannerPalette.length],
    });
  }

  return {
    radius,
    wallHeight,
    wallThickness,
    spawns,
    circles,
    boxes,
    torches,
    banners,
  };
}

export const ARENA_CONFIG: ArenaConfig = buildArenaConfig();
