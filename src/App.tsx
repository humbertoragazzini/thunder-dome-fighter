import { BabylonCanvas } from "./components/BabylonCanvas";
import ConnectToColyseus from "./components/ConnectToColyseus";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const { title, isSceneReady } = useAppStore();
  const room = useAppStore((state) => state.room);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">

      {/* Colyseum */}
      <ConnectToColyseus></ConnectToColyseus>

      {/* 3D Babylon.js Canvas */}

      {room?.roomId && <BabylonCanvas />}

      {/* Lightweight Tailwind Overlay Header */}
      <div className="absolute top-4 left-4 pointer-events-none select-none z-10 flex flex-col gap-1.5 bg-slate-900/80 backdrop-blur-sm border border-slate-800/80 px-4 py-3 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors ${isSceneReady ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
          />
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            {title}
          </h1>
        </div>
        <p className="text-xs text-slate-400">
          Scene ready • Empty canvas without meshes
        </p>
      </div>
    </div>
  );
}
