# Learning Babylon.js

A starter learning project configured with:
- **Vite** (v8+)
- **React** (v19+) & **TypeScript**
- **Tailwind CSS** (v4+)
- **Babylon.js** (v9+) (`@babylonjs/core`, `@babylonjs/loaders`)
- **Zustand** (v5+)

## Getting Started

Start the local development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Lint code:

```bash
npm run lint
```

## Project Structure

- `src/components/BabylonCanvas.tsx`: Initializes the Babylon.js `Engine`, `Scene`, `ArcRotateCamera`, `HemisphericLight`, and render loop. The scene is deliberately empty (no meshes) for you to test and experiment.
- `src/store/useAppStore.ts`: Minimal Zustand store for reactive state management.
- `src/App.tsx`: Main page rendering the canvas and a lightweight Tailwind HUD.

## How to Add Your First Mesh

In `src/components/BabylonCanvas.tsx` (or inside the `onSceneReady` callback in `App.tsx`):

```ts
import { MeshBuilder } from '@babylonjs/core'

// Example: Add a box
const box = MeshBuilder.CreateBox("box", { size: 2 }, scene)
box.position.y = 1
```

#run the server
SERVER_SLOT=1 PORT=2567 SERVER_NAME=room-1 npx tsx colyseus.ts
