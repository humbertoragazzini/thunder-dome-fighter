// ==================================================
// SCREEN: AUTHENTICATION & FIGHTER ONBOARDING
//
// WHAT IT DOES:
// Welcomes combatants to Thunder Dome Fighter, presenting an energetic
// sign-in and account registration gate.
//
// HOW IT WORKS:
// - Uses `ScreenLayout` template for atmospheric stadium lighting.
// - Features `TabNav` molecule switching between "Sign In" and "Create Account".
// - Mounts `LoginForm` or `RegisterForm` organisms with live validation and error feedback.
//
// WHY IT EXISTS:
// Acts as the initial entry screen guarding the arena against unauthenticated users.
// ==================================================

import { useState } from "react";
import { FaUserPlus } from "react-icons/fa6";
import { GiLightningShield, GiPunchBlast } from "react-icons/gi";
import { Heading } from "../ui/atoms/Heading";
import { TabNav, type TabItem } from "../ui/molecules/TabNav";
import { LoginForm } from "../ui/organisms/LoginForm";
import { RegisterForm } from "../ui/organisms/RegisterForm";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

type AuthTab = "login" | "register";

const tabs: TabItem<AuthTab>[] = [
  { id: "login", label: "Sign In", icon: <GiPunchBlast /> },
  { id: "register", label: "New Fighter", icon: <FaUserPlus /> },
];

export function AuthScreen() {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");

  return (
    <ScreenLayout
      footer={
        <div
          className="p-4 text-center text-xs text-slate-500 font-semibold tracking-wider uppercase select-none"
          style={{ fontFamily: "var(--font-tech)" }}
        >
          Thunder Dome Fighter • Authoritative Multi-Process Engine • v0.3.0
        </div>
      }
    >
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        {/* Arena Logo & Title */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 via-orange-500 to-red-600 p-0.5 shadow-[0_0_30px_rgba(245,158,11,0.4)] flex items-center justify-center animate-bounce">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-amber-400 text-3xl">
              <GiLightningShield />
            </div>
          </div>

          <Heading level="h1" color="fire" className="text-center tracking-wider">
            Thunder Dome
          </Heading>

          <p
            className="text-xs md:text-sm text-amber-400 font-bold tracking-widest uppercase text-shadow-arcade"
            style={{ fontFamily: "var(--font-arcade)" }}
          >
            Authoritative Multiplayer Arena Combat
          </p>
        </div>

        {/* Tabbed Card Shell */}
        <div className="w-full bg-slate-900/80 border-2 border-slate-800 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-[0_15px_50px_rgba(0,0,0,0.8)] flex flex-col gap-6">
          <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "login" ? <LoginForm /> : <RegisterForm />}
        </div>
      </div>
    </ScreenLayout>
  );
}
