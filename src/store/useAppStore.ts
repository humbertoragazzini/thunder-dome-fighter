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
