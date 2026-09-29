// ==================================================
// GENERIC DOMAIN CONTRACTS: LEVELS & ARENAS
//
// Declarative definitions of game environments, arena boundaries,
// and team/individual spawn coordinates.
//
// Invariant: Pure TypeScript math representations (Vector3D)
// with ZERO engine dependencies (no Babylon or Three.js).
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
  respawnSeconds: number;
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

  /** Path or identifier for server low-poly physics collision hulls */
  serverPhysicsAsset: string;

  /** Path or identifier for client high-detail visual GLB asset */
  clientVisualAsset: string;
}

// ==================================================
// DEFAULT ARENA: THUNDER DOME ALPHA
// ==================================================

export const LEVEL_THUNDER_DOME_ALPHA: LevelDefinition = {
  id: "thunder-dome-alpha",
  name: "Thunder Dome Alpha",
  description:
    "The premier circular combat arena surrounded by forcefield perimeter walls.",
  boundaries: {
    min: { x: -30, y: -5, z: -30 },
    max: { x: 30, y: 25, z: 30 },
  },
  playerSpawns: [
    // Team Alpha / Player 1 spawns (West side facing East)
    {
      id: "spawn-alpha-1",
      position: { x: -15, y: 0.5, z: 0 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },
    {
      id: "spawn-alpha-2",
      position: { x: -15, y: 0.5, z: 5 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },
    {
      id: "spawn-alpha-3",
      position: { x: -15, y: 0.5, z: -5 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },
    {
      id: "spawn-alpha-4",
      position: { x: -18, y: 0.5, z: 2.5 },
      rotationYaw: Math.PI / 2,
      teamIndex: 0,
    },

    // Team Beta / Player 2 spawns (East side facing West)
    {
      id: "spawn-beta-1",
      position: { x: 15, y: 0.5, z: 0 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },
    {
      id: "spawn-beta-2",
      position: { x: 15, y: 0.5, z: 5 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },
    {
      id: "spawn-beta-3",
      position: { x: 15, y: 0.5, z: -5 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },
    {
      id: "spawn-beta-4",
      position: { x: 18, y: 0.5, z: -2.5 },
      rotationYaw: -Math.PI / 2,
      teamIndex: 1,
    },
  ],
  itemSpawns: [
    {
      id: "item-center",
      position: { x: 0, y: 0.5, z: 0 },
      allowedCategories: ["WEAPON"],
      respawnSeconds: 30,
    },
    {
      id: "item-north",
      position: { x: 0, y: 0.5, z: 12 },
      allowedCategories: ["WEAPON", "POWERUP"],
      respawnSeconds: 20,
    },
    {
      id: "item-south",
      position: { x: 0, y: 0.5, z: -12 },
      allowedCategories: ["WEAPON", "POWERUP"],
      respawnSeconds: 20,
    },
  ],
  serverPhysicsAsset: "arenas/thunder-dome-alpha.physics.json",
  clientVisualAsset: "arenas/thunder-dome-alpha.glb",
};

/**
 * Registry mapping level ID to level definition
 */
export const LEVELS: Record<string, LevelDefinition> = {
  "thunder-dome-alpha": LEVEL_THUNDER_DOME_ALPHA,
};
