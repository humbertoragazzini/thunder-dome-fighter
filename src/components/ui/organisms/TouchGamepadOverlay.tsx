// ==================================================
// TOUCH GAMEPAD OVERLAY ORGANISM
//
// WHAT IT DOES:
// Renders an on-screen multi-touch controller overlay (virtual joystick and action
// buttons) for mobile smartphones and tablets.
//
// HOW IT WORKS:
// Detects touch support. Renders a touch joystick on the bottom-left that feeds
// normalized (moveX, moveZ) into TouchVirtualGamepadProvider, and arcade buttons
// on the bottom-right for Jump, Sprint, Punch, and Kick.
//
// WHY IT EXISTS:
// Satisfies mobile touchscreen gameplay requirements without needing physical hardware.
// Styled in the arcade/comic theme matching our Atomic Design UI system.
// ==================================================

import React, { useEffect, useRef, useState } from "react";
import { GiPunch, GiHighKick, GiSpring, GiRunningShoe } from "react-icons/gi";
import type { TouchVirtualGamepadProvider } from "../../../input/providers/TouchVirtualGamepadProvider";

interface TouchGamepadOverlayProps {
  touchProvider: TouchVirtualGamepadProvider;
}

export const TouchGamepadOverlay: React.FC<TouchGamepadOverlayProps> = ({ touchProvider }) => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const hasTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches);
    setIsTouchDevice(hasTouch);
  }, []);

  if (!isTouchDevice) {
    return null;
  }

  // Joystick touch handlers
  const handleJoystickStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleJoystickMove = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleJoystickEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        touchProvider.setMove(0, 0);
        break;
      }
    }
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2;

    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > maxRadius) {
      deltaX = (deltaX / distance) * maxRadius;
      deltaY = (deltaY / distance) * maxRadius;
    }

    setKnobPos({ x: deltaX, y: deltaY });

    // Invert Y: dragging up produces +Z movement (forward)
    const normX = deltaX / maxRadius;
    const normZ = -deltaY / maxRadius;
    touchProvider.setMove(normX, normZ);
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-30 select-none overflow-hidden">
      {/* Bottom-Left: Floating Virtual Joystick */}
      <div className="absolute bottom-8 left-8 pointer-events-auto">
        <div
          ref={joystickBaseRef}
          onTouchStart={handleJoystickStart}
          onTouchMove={handleJoystickMove}
          onTouchEnd={handleJoystickEnd}
          onTouchCancel={handleJoystickEnd}
          className="relative w-36 h-36 rounded-full bg-slate-900/60 border-2 border-amber-500/40 backdrop-blur-sm shadow-xl flex items-center justify-center touch-none"
        >
          {/* Inner stick track markings */}
          <div className="absolute w-20 h-20 rounded-full border border-dashed border-amber-400/20" />

          {/* Interactive Knob */}
          <div
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
              transition: touchIdRef.current === null ? "transform 0.15s ease-out" : "none",
            }}
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 border-2 border-yellow-200 shadow-lg shadow-amber-500/50 flex items-center justify-center"
          >
            <div className="w-5 h-5 rounded-full bg-amber-900/40" />
          </div>
        </div>
      </div>

      {/* Bottom-Right: Arcade Combat Action Buttons */}
      <div className="absolute bottom-8 right-8 pointer-events-auto flex flex-col items-end gap-3 touch-none">
        {/* Upper Row: Sprint & Heavy Punch */}
        <div className="flex gap-3">
          <button
            type="button"
            onTouchStart={() => touchProvider.setSprint(true)}
            onTouchEnd={() => touchProvider.setSprint(false)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 active:scale-90 border-2 border-cyan-300 shadow-lg shadow-cyan-500/40 flex items-center justify-center text-white text-xl active:bg-cyan-700 transition-transform"
            aria-label="Sprint"
          >
            <GiRunningShoe />
          </button>

          <button
            type="button"
            onTouchStart={() => touchProvider.setAttackAction("HEAVY_PUNCH")}
            onTouchEnd={() => touchProvider.setAttackAction("NONE")}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-600 to-red-700 active:scale-90 border-2 border-rose-300 shadow-lg shadow-red-500/40 flex items-center justify-center text-white text-xl active:bg-red-800 transition-transform"
            aria-label="Heavy Punch"
          >
            <GiPunch className="scale-125" />
          </button>
        </div>

        {/* Lower Row: Light Punch, Kick, Jump */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onTouchStart={() => touchProvider.setAttackAction("LIGHT_PUNCH")}
            onTouchEnd={() => touchProvider.setAttackAction("NONE")}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 active:scale-90 border-2 border-amber-300 shadow-lg shadow-amber-500/40 flex items-center justify-center text-white text-xl active:bg-amber-700 transition-transform"
            aria-label="Light Punch"
          >
            <GiPunch />
          </button>

          <button
            type="button"
            onTouchStart={() => touchProvider.setAttackAction("KICK")}
            onTouchEnd={() => touchProvider.setAttackAction("NONE")}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 active:scale-90 border-2 border-purple-300 shadow-lg shadow-purple-500/40 flex items-center justify-center text-white text-xl active:bg-purple-800 transition-transform"
            aria-label="Kick"
          >
            <GiHighKick />
          </button>

          {/* Jump Button (Chunky & Prominent) */}
          <button
            type="button"
            onTouchStart={() => touchProvider.setJump(true)}
            onTouchEnd={() => touchProvider.setJump(false)}
            className="w-18 h-18 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 active:scale-90 border-2 border-emerald-200 shadow-xl shadow-emerald-500/50 flex flex-col items-center justify-center text-white active:bg-emerald-700 transition-transform"
            aria-label="Jump"
          >
            <GiSpring className="text-2xl" />
            <span className="text-[10px] font-bold tracking-wider uppercase font-tech">JUMP</span>
          </button>
        </div>
      </div>
    </div>
  );
};
