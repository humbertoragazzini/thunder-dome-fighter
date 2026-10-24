// ==================================================
// COMPONENT: WEAPON HUD & INTERACTION PROMPT
//
// WHAT IT DOES:
// Renders active weapon equipment card, ammo counter/pips, weapon damage stats,
// and contextual interact/drop prompts during active matches.
//
// HOW IT WORKS:
// - Reads heldItemId and ammo from authoritative player network state.
// - Looks up weapon properties (name, damage, range, accentColor) in GAME_ITEMS.
// - When the fighter is near an available weapon pickup node (<2.0m), renders
//   a pulsing "[E] Pick up <Weapon>" interaction pill.
// - Provides one-click/touch buttons for interaction and weapon dropping on mobile.
//
// WHY IT EXISTS:
// Enforces Phase 12 HUD and input requirements, giving fighters immediate
// combat clarity on their active offensive gear and nearby arena resources.
// ==================================================

import { FaCrosshairs, FaHandFist, FaTrashCan } from "react-icons/fa6";
import { GiBroadsword, GiWarhammer, GiPistolGun } from "react-icons/gi";
import { GAME_ITEMS } from "../../../../shared/domain/GameItem";

export interface WeaponHUDProps {
  heldItemId: string;
  ammo: number;
  nearbyWeapon?: {
    id: string;
    name: string;
    accentColor: string;
  } | null;
  onInteract?: () => void;
  onDropWeapon?: () => void;
  className?: string;
}

export function WeaponHUD({
  heldItemId,
  ammo,
  nearbyWeapon,
  onInteract,
  onDropWeapon,
  className = "",
}: WeaponHUDProps) {
  const item = GAME_ITEMS[heldItemId] ?? GAME_ITEMS.FISTS;
  const isUnarmed = item.id === "FISTS";

  // Select appropriate weapon icon
  const renderWeaponIcon = () => {
    switch (item.id) {
      case "ENERGY_BLADE":
        return <GiBroadsword className="text-xl text-cyan-400" />;
      case "THUNDER_HAMMER":
        return <GiWarhammer className="text-xl text-yellow-400" />;
      case "PLASMA_PISTOL":
        return <GiPistolGun className="text-xl text-purple-400" />;
      default:
        return <FaHandFist className="text-lg text-amber-400" />;
    }
  };

  return (
    <div className={`flex flex-col items-center gap-2 pointer-events-auto ${className}`}>
      {/* 1. Contextual Proximity Interaction Prompt */}
      {nearbyWeapon && (
        <button
          onClick={onInteract}
          type="button"
          className="flex items-center gap-2.5 px-4 py-2 bg-slate-900/95 backdrop-blur-md border-2 border-emerald-400 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-bounce cursor-pointer hover:bg-slate-800 transition-all text-xs font-black uppercase tracking-wider text-emerald-300"
          style={{ fontFamily: "var(--font-game)" }}
        >
          <span className="w-5 h-5 rounded-md bg-emerald-500/30 border border-emerald-400 flex items-center justify-center text-[10px] text-white">
            E
          </span>
          <span>Pick up {nearbyWeapon.name}</span>
        </button>
      )}

      {/* 2. Active Weapon Equipment Card */}
      <div
        className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-md border px-4 py-2 rounded-2xl shadow-xl transition-all"
        style={{ borderColor: `${item.accentColor}66` }}
      >
        {/* Weapon Icon Badge */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner"
          style={{
            backgroundColor: `${item.accentColor}1a`,
            borderColor: `${item.accentColor}4d`,
          }}
        >
          {renderWeaponIcon()}
        </div>

        {/* Weapon Info & Stats */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span
              className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-100"
              style={{ fontFamily: "var(--font-game)" }}
            >
              {item.name}
            </span>
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300"
            >
              {item.damage} DMG
            </span>
          </div>

          {/* Ammo / Durability Indicator */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            {item.weaponType === "RANGED" ? (
              <div className="flex items-center gap-1 text-purple-300">
                <FaCrosshairs className="text-[10px]" />
                <span>
                  AMMO: <strong>{ammo}</strong> / {item.ammoCapacity}
                </span>
              </div>
            ) : (
              <span className="text-slate-400">
                {isUnarmed ? "BARE-KNUCKLE" : "INFINITE EDGE"} (∞)
              </span>
            )}
          </div>
        </div>

        {/* 3. Drop Weapon Button (When holding an arena weapon) */}
        {!isUnarmed && onDropWeapon && (
          <button
            onClick={onDropWeapon}
            type="button"
            title="Drop Weapon (Key G or Q)"
            className="ml-1 p-2 rounded-xl bg-slate-800/80 hover:bg-red-950/80 border border-slate-700 hover:border-red-500/60 text-slate-400 hover:text-red-300 transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold"
          >
            <FaTrashCan className="text-xs" />
            <span className="hidden sm:inline">DROP [G]</span>
          </button>
        )}
      </div>
    </div>
  );
}
