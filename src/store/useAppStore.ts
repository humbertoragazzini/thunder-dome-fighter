// ==================================================
// CLIENT APPLICATION GLOBAL STORE (ZUSTAND)
//
// WHAT IT DOES:
// Holds global client-side application state including scene readiness
// and the active Colyseus multiplayer room reference.
//
// HOW IT WORKS:
// - Maintains `room`: The connected Colyseus `Room` instance.
// - Maintains `isSceneReady`: Flag indicating whether Babylon.js 3D viewport
//   and Havok physics have finished initial engine loading.
//
// WHY IT EXISTS:
// Provides cross-component access to the active network room instance
// and engine readiness without prop-drilling.
// ==================================================

import type { Room } from '@colyseus/sdk'
import { create } from 'zustand'

interface AppState {
  title: string
  isSceneReady: boolean
  room: Room | null
  setRoom: (ready: Room | null) => void
  setReady: (ready: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  title: 'Learning Babylon.js',
  isSceneReady: false,
  room:null,
  setRoom: (connectedRoom)=> set({room: connectedRoom}),
  setReady: (ready) => set({ isSceneReady: ready }),
}))
