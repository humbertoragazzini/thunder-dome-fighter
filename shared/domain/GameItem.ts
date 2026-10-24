// ==================================================
// GENERIC DOMAIN CONTRACTS: GAME ITEMS & WEAPONS
//
// WHAT IT DOES:
// Declares the generic GameItem interface, item categories (WEAPON, POWERUP, TOOL),
// weapon archetypes (MELEE, RANGED), and the standard GAME_ITEMS catalog registry.
//
// HOW IT WORKS:
// Supplies engine-agnostic item definitions with physical combat parameters (damage,
// range, cone angle, knockback impulse, cooldown, ammo capacity, health restoration)
// and visual metadata (meshAssetId, accentColor) consumed by both the server
// simulation and client rendering engine.
//
// WHY IT EXISTS:
// Enforces ADR-006 (Generic Domain Models). Enables weapons, health pickups, and future
// powerups or tools to be added dynamically without hardcoding combat rules or subclassing
// game room instances.
// ==================================================

export type ItemCategory = "WEAPON" | "POWERUP" | "TOOL";

export type WeaponType = "MELEE" | "RANGED";

export interface GameItem {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  weaponType?: WeaponType;

  /** Base damage dealt upon successful hit */
  damage: number;

  /** Effective strike range or maximum projectile travel distance in meters */
  range: number;

  /** Forward strike arc in radians (for melee cone checks; 0 for linear projectile) */
  coneAngleRad: number;

  /** Base physical knockback impulse imparted on victim body */
  knockbackImpulse: number;

  /** Cooldown time in seconds before this item can be used again */
  cooldownSeconds: number;

  /** Maximum ammo capacity (0 indicates infinite ammo or melee weapon) */
  ammoCapacity: number;

  /** Amount of health restored upon consumption (>0 for health pickups) */
  healthRestore: number;

  /** Visual 3D asset identifier for client rendering */
  meshAssetId: string;

  /** Hex color code for visual glow, particles, and HUD branding */
  accentColor: string;
}

// ==================================================
// STANDARD ITEM & WEAPON CATALOG
// ==================================================

export const GAME_ITEMS: Record<string, GameItem> = {
  // 1. Default Unarmed Melee
  FISTS: {
    id: "FISTS",
    name: "Fists",
    description: "Standard bare-knuckle brawling. Fast jabs, solid kicks, and close-quarters shoving.",
    category: "WEAPON",
    weaponType: "MELEE",
    damage: 7,
    range: 2.0,
    coneAngleRad: (60 * Math.PI) / 180,
    knockbackImpulse: 1.5,
    cooldownSeconds: 0.25,
    ammoCapacity: 0,
    healthRestore: 0,
    meshAssetId: "fists",
    accentColor: "#f59e0b", // Amber
  },

  // 2. Pickup Melee: Energy Blade
  ENERGY_BLADE: {
    id: "ENERGY_BLADE",
    name: "Energy Blade",
    description: "High-frequency plasma edge katana. Fast swings with extended reach and slicing damage.",
    category: "WEAPON",
    weaponType: "MELEE",
    damage: 22,
    range: 2.8,
    coneAngleRad: (70 * Math.PI) / 180,
    knockbackImpulse: 3.5,
    cooldownSeconds: 0.32,
    ammoCapacity: 0,
    healthRestore: 0,
    meshAssetId: "energy_blade",
    accentColor: "#06b6d4", // Cyan
  },

  // 3. Heavy Melee: Thunder Hammer
  THUNDER_HAMMER: {
    id: "THUNDER_HAMMER",
    name: "Thunder Hammer",
    description: "Heavy kinetic warhammer. Slower swing speed but delivers massive damage and devastating knockback.",
    category: "WEAPON",
    weaponType: "MELEE",
    damage: 35,
    range: 3.0,
    coneAngleRad: (55 * Math.PI) / 180,
    knockbackImpulse: 5.0,
    cooldownSeconds: 1.0,
    ammoCapacity: 0,
    healthRestore: 0,
    meshAssetId: "thunder_hammer",
    accentColor: "#eab308", // Gold
  },

  // 4. Ranged Weapon: Plasma Pistol
  PLASMA_PISTOL: {
    id: "PLASMA_PISTOL",
    name: "Plasma Pistol",
    description: "Compact directed-energy sidearm. Fires concentrated energy bolts over long range.",
    category: "WEAPON",
    weaponType: "RANGED",
    damage: 16,
    range: 18.0,
    coneAngleRad: (15 * Math.PI) / 180,
    knockbackImpulse: 3.0,
    cooldownSeconds: 0.35,
    ammoCapacity: 12,
    healthRestore: 0,
    meshAssetId: "plasma_pistol",
    accentColor: "#a855f7", // Purple
  },

  // 5. Minor Health Recovery Stim
  HEALTH_PACK_SMALL: {
    id: "HEALTH_PACK_SMALL",
    name: "Nano Stim (Small)",
    description: "Rapid cellular repair capsule. Immediately restores +25 HP on walk-over.",
    category: "POWERUP",
    damage: 0,
    range: 0,
    coneAngleRad: 0,
    knockbackImpulse: 0,
    cooldownSeconds: 0,
    ammoCapacity: 0,
    healthRestore: 25,
    meshAssetId: "health_pack_small",
    accentColor: "#10b981", // Emerald
  },

  // 6. Major Health Recovery Stim
  HEALTH_PACK_LARGE: {
    id: "HEALTH_PACK_LARGE",
    name: "Mega Stim (Large)",
    description: "High-potency revitalization kit. Immediately restores +50 HP on walk-over.",
    category: "POWERUP",
    damage: 0,
    range: 0,
    coneAngleRad: 0,
    knockbackImpulse: 0,
    cooldownSeconds: 0,
    ammoCapacity: 0,
    healthRestore: 50,
    meshAssetId: "health_pack_large",
    accentColor: "#34d399", // Mint Emerald
  },
};
