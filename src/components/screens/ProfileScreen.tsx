// ==================================================
// SCREEN: FULL FIGHTER CAREER PROFILE & DOSSIER
//
// WHAT IT DOES:
// Displays a comprehensive, full-page combat profile with multi-dimensional
// lifetime stats, derived combat ratios, weapon mastery cards, and recent match logs.
//
// HOW IT WORKS:
// - Automatically calls `useProfileStore.getState().fetchProfile()` on mount.
// - Provides a tabbed interface (Career Dossier, Weapon Mastery, Match History).
// - Derives dynamic fighter tiers from lifetime combat score and wins.
// - Supports manual refresh to pull newly finalized match results immediately.
//
// WHY IT EXISTS:
// In compliance with Phase 14, provides fighters with a dedicated, permanent
// competitive career profile celebrating their combat achievements.
// ==================================================

import { useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaCalendarDays,
  FaClock,
  FaFire,
  FaHandFist,
  FaMedal,
  FaRotate,
  FaShieldHalved,
  FaSkull,
  FaTrophy,
} from "react-icons/fa6";
import {
  GiBroadsword,
  GiCrossedSwords,
  GiPistolGun,
  GiPodiumWinner,
  GiPunch,
  GiTargetPrize,
  GiWarhammer,
} from "react-icons/gi";
import { useAuthStore } from "../../store/useAuthStore";
import { useNavigationStore } from "../../store/useNavigationStore";
import { useProfileStore } from "../../store/useProfileStore";
import { Badge } from "../ui/atoms/Badge";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { Spinner } from "../ui/atoms/Spinner";
import { StatBadge } from "../ui/molecules/StatBadge";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

type ProfileTab = "OVERVIEW" | "WEAPONS" | "HISTORY";

function getFighterTier(score: number, wins: number): { label: string; color: "amber" | "cyan" | "purple" | "emerald" | "slate" } {
  if (score >= 2000 || wins >= 25) {
    return { label: "Diamond Gladiator", color: "cyan" };
  }
  if (score >= 1000 || wins >= 10) {
    return { label: "Gold Contender", color: "amber" };
  }
  if (score >= 400 || wins >= 3) {
    return { label: "Silver Brawler", color: "purple" };
  }
  return { label: "Rookie Contender", color: "slate" };
}

function getWeaponIcon(itemId: string) {
  switch (itemId) {
    case "ENERGY_BLADE":
      return <GiBroadsword className="text-cyan-400 text-3xl" />;
    case "THUNDER_HAMMER":
      return <GiWarhammer className="text-amber-400 text-3xl" />;
    case "PLASMA_PISTOL":
      return <GiPistolGun className="text-rose-400 text-3xl" />;
    default:
      return <GiPunch className="text-slate-400 text-3xl" />;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function formatDate(dateInput: Date | string): string {
  try {
    const d = new Date(dateInput);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Recent";
  }
}

export function ProfileScreen() {
  const [activeTab, setActiveTab] = useState<ProfileTab>("OVERVIEW");

  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const goBack = useNavigationStore((state) => state.goBack);
  const authPlayer = useAuthStore((state) => state.player);
  const authUser = useAuthStore((state) => state.user);

  const profileData = useProfileStore((state) => state.profileData);
  const isLoading = useProfileStore((state) => state.isLoading);
  const error = useProfileStore((state) => state.error);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const stats = profileData?.stats;
  const derived = profileData?.derived;
  const player = profileData?.player ?? authPlayer;
  const weaponMastery = profileData?.weaponMastery ?? [];
  const recentMatches = profileData?.recentMatches ?? [];

  const tier = getFighterTier(derived?.combatScore ?? 0, stats?.wins ?? 0);

  return (
    <ScreenLayout
      header={
        <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between backdrop-blur-md shadow-lg select-none">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={goBack}
              leftIcon={<FaArrowLeft />}
            >
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Heading level="h4" color="gold">
                Career Dossier
              </Heading>
              <Badge variant={tier.color}>
                {tier.label}
              </Badge>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchProfile(true)}
            leftIcon={<FaRotate className={isLoading ? "animate-spin" : ""} />}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>
      }
      footer={
        <div className="w-full bg-slate-950/80 border-t border-slate-800/80 px-4 md:px-8 py-2.5 flex items-center justify-between text-xs text-slate-400 select-none">
          <span style={{ fontFamily: "var(--font-tech)" }}>
            Thunder Dome Fighter Competitive Records • Phase 14
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            Authoritative PostgreSQL Statistics
          </span>
        </div>
      }
    >
      <div className="w-full max-w-5xl flex flex-col gap-6 py-4">
        {/* Fighter ID Banner Header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-2xl backdrop-blur-xl">
          {/* Avatar Icon */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-amber-300 p-0.5 shadow-xl flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-amber-400 text-4xl shadow-inner">
              <GiPodiumWinner />
            </div>
          </div>

          {/* Identity Info */}
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <Heading level="h2" color="gold" className="tracking-wide">
                {player?.playerName ?? "Fighter"}
              </Heading>
              <Badge variant={tier.color}>
                {tier.label}
              </Badge>
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Season 1 Active
              </span>
            </div>

            <p
              className="text-xs text-slate-400 flex items-center gap-2 mt-1"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              <span>Account: {authUser?.email ?? "Authenticated Combatant"}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <FaCalendarDays className="text-slate-500" />
                Joined: {formatDate(player?.createdAt ?? new Date())}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-amber-300 font-black tracking-wider uppercase bg-amber-950/40 border border-amber-600/40 px-2.5 py-1 rounded-lg">
                Combat Score: {derived?.combatScore ?? 0}
              </span>
              <span className="text-xs text-cyan-300 font-bold tracking-wider uppercase bg-cyan-950/40 border border-cyan-600/40 px-2.5 py-1 rounded-lg">
                K/D Differential: {(derived?.kdDifferential ?? 0) >= 0 ? `+${derived?.kdDifferential ?? 0}` : derived?.kdDifferential}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab("OVERVIEW")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition ${
              activeTab === "OVERVIEW"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-lg"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
            style={{ fontFamily: "var(--font-game)" }}
          >
            <GiTargetPrize className="text-base" />
            Career Overview
          </button>

          <button
            onClick={() => setActiveTab("WEAPONS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition ${
              activeTab === "WEAPONS"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-lg"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
            style={{ fontFamily: "var(--font-game)" }}
          >
            <GiBroadsword className="text-base" />
            Weapon Mastery ({weaponMastery.length})
          </button>

          <button
            onClick={() => setActiveTab("HISTORY")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition ${
              activeTab === "HISTORY"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-lg"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
            style={{ fontFamily: "var(--font-game)" }}
          >
            <FaClock className="text-base" />
            Match History ({recentMatches.length})
          </button>
        </div>

        {/* Loading Spinner State */}
        {isLoading && !profileData && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner size="lg" color="amber" />
            <span
              className="text-xs uppercase tracking-widest text-slate-400"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              Retrieving Authoritative Dossier...
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/50 text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={() => fetchProfile(true)}>
              Retry
            </Button>
          </div>
        )}

        {/* Tab 1: Career Overview */}
        {activeTab === "OVERVIEW" && stats && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Primary Win/Loss & K/D Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <StatBadge
                icon={<FaTrophy />}
                label="Victories"
                value={stats.wins}
                color="amber"
              />
              <StatBadge
                icon={<FaShieldHalved />}
                label="Defeats"
                value={stats.losses}
                color="slate"
              />
              <StatBadge
                icon={<GiTargetPrize />}
                label="Win Rate"
                value={`${(derived?.winRatePercentage ?? 0).toFixed(1)}%`}
                color="emerald"
              />
              <StatBadge
                icon={<GiCrossedSwords />}
                label="K/D Ratio"
                value={(derived?.killDeathRatio ?? 0).toFixed(2)}
                color="red"
              />
            </div>

            {/* Combat Totals Grid */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col gap-4">
              <h3
                className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2"
                style={{ fontFamily: "var(--font-game)" }}
              >
                <FaFire className="text-amber-400" />
                Combat Performance Breakdown
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <StatBadge
                  icon={<FaMedal />}
                  label="Total Matches"
                  value={stats.totalMatches}
                  color="slate"
                />
                <StatBadge
                  icon={<GiCrossedSwords />}
                  label="Total Kills"
                  value={stats.kills}
                  color="red"
                />
                <StatBadge
                  icon={<FaSkull />}
                  label="Total Deaths"
                  value={stats.deaths}
                  color="slate"
                />
                <StatBadge
                  icon={<FaHandFist />}
                  label="Total Assists"
                  value={stats.assists}
                  color="cyan"
                />
                <StatBadge
                  icon={<FaFire />}
                  label="Total DMG Dealt"
                  value={stats.damageDealt.toLocaleString()}
                  color="emerald"
                />
                <StatBadge
                  icon={<FaShieldHalved />}
                  label="Total DMG Taken"
                  value={stats.damageReceived.toLocaleString()}
                  color="rose"
                />
              </div>

              {/* Averages per Match */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)" }}>
                    Average Damage Dealt / Bout
                  </span>
                  <span className="text-sm font-black text-emerald-400 font-mono">
                    {derived?.averageDamageDealt.toLocaleString() ?? 0} DMG
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)" }}>
                    Average Damage Received / Bout
                  </span>
                  <span className="text-sm font-black text-rose-400 font-mono">
                    {derived?.averageDamageReceived.toLocaleString() ?? 0} DMG
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Weapon Mastery */}
        {activeTab === "WEAPONS" && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <p
              className="text-xs text-slate-400"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              Lifetime performance aggregated across all weapons deployed in authoritative arena combat:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {weaponMastery.map((weapon) => (
                <div
                  key={weapon.itemId}
                  className="flex flex-col gap-3 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition shadow-lg relative overflow-hidden"
                >
                  {/* Accent Top Border */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: weapon.accentColor }}
                  />

                  {/* Weapon Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-center shadow-inner">
                        {getWeaponIcon(weapon.itemId)}
                      </div>
                      <div className="flex flex-col">
                        <span
                          className="text-base font-black uppercase tracking-wider text-slate-100"
                          style={{ fontFamily: "var(--font-game)" }}
                        >
                          {weapon.name}
                        </span>
                        <span
                          className="text-[10px] text-slate-400 uppercase tracking-widest font-bold"
                          style={{ fontFamily: "var(--font-tech)" }}
                        >
                          Category: {weapon.category}
                        </span>
                      </div>
                    </div>

                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider font-mono bg-slate-800/80 text-slate-300"
                    >
                      {weapon.matchesUsed} Bouts
                    </span>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800/60 font-mono text-center">
                    <div className="flex flex-col p-2 rounded-lg bg-slate-950/60">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Hits</span>
                      <span className="text-sm font-bold text-slate-200">{weapon.hits}</span>
                    </div>
                    <div className="flex flex-col p-2 rounded-lg bg-slate-950/60">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">KOs</span>
                      <span className="text-sm font-bold text-amber-400">{weapon.kills}</span>
                    </div>
                    <div className="flex flex-col p-2 rounded-lg bg-slate-950/60">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Damage</span>
                      <span className="text-sm font-bold text-emerald-400">{weapon.damageDealt.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col p-2 rounded-lg bg-slate-950/60">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">DMG/Hit</span>
                      <span className="text-sm font-bold text-cyan-400">{weapon.damagePerHit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Match History */}
        {activeTab === "HISTORY" && (
          <div className="flex flex-col gap-3 animate-fade-in">
            {recentMatches.length === 0 ? (
              <div className="py-16 text-center text-slate-500 italic bg-slate-900/60 rounded-2xl border border-slate-800">
                No recorded match history found. Deploy into the arena to begin logging bouts!
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {recentMatches.map((match) => (
                  <div
                    key={match.matchId}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border transition gap-3 ${
                      match.isWinner
                        ? "bg-amber-950/20 border-amber-500/40 hover:bg-amber-950/30"
                        : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/60"
                    }`}
                  >
                    {/* Left: Outcome & Mode */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0 ${
                          match.isWinner
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-md"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {match.isWinner ? <FaTrophy /> : <FaSkull />}
                      </div>

                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-black uppercase tracking-wider ${
                              match.isWinner ? "text-amber-400" : "text-slate-300"
                            }`}
                            style={{ fontFamily: "var(--font-game)" }}
                          >
                            {match.isWinner ? "VICTORY" : "DEFEAT"}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
                            Mode: {match.gameModeId}
                          </span>
                        </div>
                        <span
                          className="text-xs text-slate-400"
                          style={{ fontFamily: "var(--font-tech)" }}
                        >
                          {match.levelId} • {formatDuration(match.durationSeconds)} • {formatDate(match.endedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Right: Personal Scorecard */}
                    <div className="flex items-center gap-4 font-mono text-xs sm:text-sm self-end sm:self-center">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-500 uppercase">Score</span>
                        <span className="font-bold text-amber-400">{match.score}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-500 uppercase">K / D / A</span>
                        <span>
                          <strong className="text-emerald-400">{match.kills}</strong> /{" "}
                          <strong className="text-rose-400">{match.deaths}</strong> /{" "}
                          <strong className="text-cyan-400">{match.assists}</strong>
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-500 uppercase">DMG Dealt</span>
                        <span className="font-bold text-emerald-400">{match.damageDealt}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}
