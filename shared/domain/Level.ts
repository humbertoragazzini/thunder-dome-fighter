// ==================================================
// GENERIC DOMAIN CONTRACTS: LEVELS & ARENAS
//
// WHAT IT DOES:
// Declares level geometry data structures (Vector3D, BoundingBox3D, SpawnPoint,
// ItemSpawnPoint, LevelDefinition) and the standard arena registry.
//
// HOW IT WORKS:
// Uses engine-agnostic vector representations to declare spawn points,
// item pickups, and kill boundaries (ring-out envelopes) loaded by both
// the Havok physics server and Babylon client scene.
//
// WHY IT EXISTS:
// Enforces ADR-006 (Generic Domain Models). Keeps environment definitions
// decoupled from rendering engines and physics systems so arena configs can
// be loaded dynamically from database or static manifests.
// ==================================================

/**
 * Pure 3D vector for domain-level coordinate math.
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Bounding volume defining physical containment limits of an arena.
 */
export interface BoundingBox3D {
  min: Vector3D;
  max: Vector3D;
}

/**
 * Designated spawn point for a player.
 */
export interface SpawnPoint {
  id: string;
  position: Vector3D;

  /** Horizontal look direction in radians */
  rotationYaw: number;

  /**
   * Optional team affinity:
   * 0 = Team Alpha, 1 = Team Beta, undefined = Neutral / FFA
   */
  teamIndex?: number;
}

/**
 * Designated arena location where weapons or powerups spawn.
 */
export interface ItemSpawnPoint {
  id: string;
  position: Vector3D;
  allowedCategories: Array<"WEAPON" | "POWERUP" | "TOOL">;
  defaultItemId?: string;
  respawnSeconds: number;
}

/**
 * Collision shape type recognized by physics loaders.
 */
export type CollisionShapeType = "BOX" | "CYLINDER";

/**
 * Functional role of a physical collision surface.
 */
export type SurfaceRole = "FLOOR" | "PLATFORM" | "WALL" | "HAZARD";

/**
 * Pure geometric declaration of a physical collision hull in the level.
 * Can be loaded directly by Havok or matched against Blender `COL_*` nodes.
 */
export interface CollisionHullDefinition {
  id: string;
  shapeType: CollisionShapeType;
  role: SurfaceRole;
  position: Vector3D;
  rotationEuler?: Vector3D;
  boxDimensions?: Vector3D;
  cylinderRadius?: number;
  cylinderHeight?: number;
  blenderNodeName?: string;
}

/**
 * Visual styling theme configuration for rendering in Babylon.js.
 */
export interface VisualThemeDefinition {
  primaryFloorColor: string;
  secondaryFloorColor: string;
  accentGlowColor: string;
  forcefieldColor: string;
  forcefieldAlpha: number;
  skyboxTheme: "CYBER_DOME" | "DEEP_SPACE" | "NEON_CITY";
  ambientLightColor: string;
  spotlightColor: string;
}

/**
 * LevelDefinition: Master specification for an arena environment.
 */
export interface LevelDefinition {
  id: string;
  name: string;
  description: string;

  /** Bounding box used by server to detect players falling out of bounds */
  boundaries: BoundingBox3D;

  /** Player spawn positions */
  playerSpawns: SpawnPoint[];

  /** Weapon / powerup spawn positions */
  itemSpawns: ItemSpawnPoint[];

  /** Declarative physical collision hulls loaded by Havok (NullEngine safe) */
  collisionHulls: CollisionHullDefinition[];

  /** Aesthetic theme parameters for client visual environment */
  visualTheme: VisualThemeDefinition;

  /** Path or identifier for server low-poly physics collision hulls */
  serverPhysicsAsset: string;

  /** Path or identifier for client high-detail visual GLB asset */
  clientVisualAsset: string;
}

// ==================================================
// DEFAULT ARENA: THUNDER DOME ALPHA
// ==================================================

function generateCircularPerimeterWalls(
  radius: number,
  segmentCount: number,
  height: number,
  thickness: number,
): CollisionHullDefinition[] {
  const walls: CollisionHullDefinition[] = [];
  const angleStep = (2 * Math.PI) / segmentCount;
  const chordLength = 2 * radius * Math.sin(angleStep / 2) * 1.06;

  for (let i = 0; i < segmentCount; i++) {
    const angle = i * angleStep;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const y = height / 2;

    walls.push({
      id: `hull-wall-${i}`,
      shapeType: "BOX",
      role: "WALL",
      position: { x, y, z },
      rotationEuler: { x: 0, y: angle, z: 0 },
      boxDimensions: { x: chordLength, y: height, z: thickness },
      blenderNodeName: `COL_Wall_${i}`,
    });
  }
  return walls;
}

export const LEVEL_THUNDER_DOME_ALPHA: LevelDefinition = {
  id: "thunder-dome-alpha",
  name: "Thunder Dome Alpha",
  description:
    "The premier circular combat arena surrounded by forcefield perimeter walls.",
  boundaries: {
    min: { x: -25, y: -5, z: -25 },
    max: { x: 25, y: 25, z: 25 },
  },
  playerSpawns: [
    // Team Alpha / Player 1 spawns (West side facing East, staggered assault formation)
    {
      id: "spawn-alpha-1",
      position: { x: -10, y: 0.55, z: 2 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },
    {
      id: "spawn-alpha-2",
      position: { x: -10, y: 0.55, z: -2 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },
    {
      id: "spawn-alpha-3",
      position: { x: -13, y: 0.55, z: 4 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },
    {
      id: "spawn-alpha-4",
      position: { x: -13, y: 0.55, z: -4 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },

    // Team Beta / Player 2 spawns (East side facing West, staggered assault formation)
    {
      id: "spawn-beta-1",
      position: { x: 10, y: 0.55, z: 2 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },
    {
      id: "spawn-beta-2",
      position: { x: 10, y: 0.55, z: -2 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },
    {
      id: "spawn-beta-3",
      position: { x: 13, y: 0.55, z: 4 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },
    {
      id: "spawn-beta-4",
      position: { x: 13, y: 0.55, z: -4 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },

    // --------------------------------------------------
    // Neutral & Free-For-All (FFA) Spawns (12 distinct perimeter/platform positions)
    // Inward-facing yaw rotations, minimum clearance >= 3.6m from all other spawns.
    // --------------------------------------------------
    // North Perimeter Arc
    {
      id: "spawn-ffa-1",
      position: { x: -6, y: 0.55, z: 11 },
      rotationYaw: Math.atan2(6, -11),
    },
    {
      id: "spawn-ffa-2",
      position: { x: 0, y: 0.55, z: 13 },
      rotationYaw: Math.PI,
    },
    {
      id: "spawn-ffa-3",
      position: { x: 6, y: 0.55, z: 11 },
      rotationYaw: Math.atan2(-6, -11),
    },
    // South Perimeter Arc
    {
      id: "spawn-ffa-4",
      position: { x: -6, y: 0.55, z: -11 },
      rotationYaw: Math.atan2(6, 11),
    },
    {
      id: "spawn-ffa-5",
      position: { x: 0, y: 0.55, z: -13 },
      rotationYaw: 0,
    },
    {
      id: "spawn-ffa-6",
      position: { x: 6, y: 0.55, z: -11 },
      rotationYaw: Math.atan2(-6, 11),
    },
    // Flank Quadrants
    {
      id: "spawn-ffa-7",
      position: { x: -11, y: 0.55, z: 7 },
      rotationYaw: Math.atan2(11, -7),
    },
    {
      id: "spawn-ffa-8",
      position: { x: 11, y: 0.55, z: 7 },
      rotationYaw: Math.atan2(-11, -7),
    },
    {
      id: "spawn-ffa-9",
      position: { x: -11, y: 0.55, z: -7 },
      rotationYaw: Math.atan2(11, 7),
    },
    {
      id: "spawn-ffa-10",
      position: { x: 11, y: 0.55, z: -7 },
      rotationYaw: Math.atan2(-11, 7),
    },
    // Elevated Platform Sparring Overlooks
    {
      id: "spawn-ffa-11",
      position: { x: -1.5, y: 1.75, z: 7.5 },
      rotationYaw: Math.PI,
    },
    {
      id: "spawn-ffa-12",
      position: { x: 1.5, y: 1.75, z: -7.5 },
      rotationYaw: 0,
    },
  ],
  itemSpawns: [
    // 1. Center Arena: Heavy Melee (Thunder Hammer)
    {
      id: "item-center",
      position: { x: 0, y: 0.5, z: 0 },
      allowedCategories: ["WEAPON"],
      defaultItemId: "THUNDER_HAMMER",
      respawnSeconds: 30,
    },
    // 2. North Platform: Ranged (Plasma Pistol)
    {
      id: "item-north",
      position: { x: 0, y: 1.7, z: 7.5 },
      allowedCategories: ["WEAPON"],
      defaultItemId: "PLASMA_PISTOL",
      respawnSeconds: 20,
    },
    // 3. South Platform: Light Melee (Energy Blade)
    {
      id: "item-south",
      position: { x: 0, y: 1.7, z: -7.5 },
      allowedCategories: ["WEAPON"],
      defaultItemId: "ENERGY_BLADE",
      respawnSeconds: 20,
    },
    // 4. West Flank: Minor Health Stim (+25 HP)
    {
      id: "item-health-west",
      position: { x: -7.0, y: 0.5, z: 0 },
      allowedCategories: ["POWERUP"],
      defaultItemId: "HEALTH_PACK_SMALL",
      respawnSeconds: 15,
    },
    // 5. East Flank: Minor Health Stim (+25 HP)
    {
      id: "item-health-east",
      position: { x: 7.0, y: 0.5, z: 0 },
      allowedCategories: ["POWERUP"],
      defaultItemId: "HEALTH_PACK_SMALL",
      respawnSeconds: 15,
    },
    // 6. Contested Apex: Mega Health Stim (+50 HP)
    {
      id: "item-health-center",
      position: { x: 0, y: 0.5, z: 3.5 },
      allowedCategories: ["POWERUP"],
      defaultItemId: "HEALTH_PACK_LARGE",
      respawnSeconds: 30,
    },
  ],
  collisionHulls: [
    // 1. Main circular combat arena floor (R = 16m, top surface at Y = 0)
    {
      id: "hull-floor",
      shapeType: "CYLINDER",
      role: "FLOOR",
      position: { x: 0, y: -0.5, z: 0 },
      cylinderRadius: 16.0,
      cylinderHeight: 1.0,
      blenderNodeName: "COL_Floor",
    },
    // 2. Elevated sparring platform North (top surface at Y = 1.2m)
    {
      id: "hull-platform-north",
      shapeType: "BOX",
      role: "PLATFORM",
      position: { x: 0, y: 0.9, z: 7.5 },
      boxDimensions: { x: 4.0, y: 0.6, z: 4.0 },
      blenderNodeName: "COL_Platform_N",
    },
    // 3. Elevated sparring platform South (top surface at Y = 1.2m)
    {
      id: "hull-platform-south",
      shapeType: "BOX",
      role: "PLATFORM",
      position: { x: 0, y: 0.9, z: -7.5 },
      boxDimensions: { x: 4.0, y: 0.6, z: 4.0 },
      blenderNodeName: "COL_Platform_S",
    },
    // 4. Perimeter forcefield barrier walls (16 tangent box segments at R = 16m)
    ...generateCircularPerimeterWalls(16.0, 16, 6.0, 0.6),
  ],
  visualTheme: {
    primaryFloorColor: "#111827",
    secondaryFloorColor: "#1f2937",
    accentGlowColor: "#00e5ff",
    forcefieldColor: "#00e5ff",
    forcefieldAlpha: 0.22,
    skyboxTheme: "CYBER_DOME",
    ambientLightColor: "#334155",
    spotlightColor: "#f8fafc",
  },
  serverPhysicsAsset: "arenas/thunder-dome-alpha.physics.json",
  clientVisualAsset: "arenas/thunder-dome-alpha.glb",
};

/**
 * Registry mapping level ID to level definition
 */
export const LEVELS: Record<string, LevelDefinition> = {
  "thunder-dome-alpha": LEVEL_THUNDER_DOME_ALPHA,
};
