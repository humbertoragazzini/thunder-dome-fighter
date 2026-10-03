# Phase 3 — Application Shell, UI Navigation & Screen State Management

## Architectural Overview

Phase 3 transitions *Thunder Dome Fighter* from a bare developer canvas into a full-featured, competitive fighting game frontend shell. It establishes a centralized screen state machine, an atomic design UI component library styled with playful arcade gaming typography (`Luckiest Guy`, `Bangers`, and `Chakra Petch`), and seamless integration with the Fastify authentication API and authoritative Colyseus game rooms.

```
                   ┌──────────────────────────────────────────────────┐
                   │                  [ App.tsx ]                     │
                   │       (Root Router & checkAuth Hydration)        │
                   └────────────────────────┬─────────────────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
      [ useAuthStore ]             [ useNavigationStore ]        [ useAppStore ]
   • Token Persistence          • Active Screen Machine       • Babylon Engine
   • Player Persona             • Modal State Management      • Room Connection
   • Lifetime Stats             • History & Auth Guards       • Physics Readiness
               │                            │
               └──────────────┬─────────────┘
                              ▼
           ┌─────────────────────────────────────┐
           │          Active Screen View         │
           ├─────────────────────────────────────┤
           │ AUTH          ──► [ AuthScreen ]    │
           │ MAIN_MENU     ──► [ MainMenuScreen ]│
           │ PLAY_MENU     ──► [ PlayMenuScreen ]│
           │ MATCH_LOADING ──► [ MatchLoading ]  │
           │ IN_GAME       ──► [ InGameOverlay ] │
           └─────────────────────────────────────┘
```

---

## 1. Atomic Design UI Hierarchy

All UI components are organized strictly according to Atomic Design principles in `src/components/ui/`:

### Atoms (`src/components/ui/atoms/`)
- **`Button.tsx`**: Tactile arcade button with sound-ready push-down animation (`active:translate-y-1`), 3D shadow depths, loading spinners, and color variants (`primary`, `danger`, `accent`, `secondary`, `ghost`).
- **`Input.tsx`**: Accessible text and password input fields with glowing amber focus borders and validation error rings.
- **`Badge.tsx`**: Status tag pills for latency, online indicators, and competitive rank tags.
- **`Heading.tsx`**: Punchy display typography atom leveraging `Luckiest Guy` and `Bangers` with text-shadow and gradient fills.
- **`Spinner.tsx`**: Animated circular loading spinner with neon color accents.

### Molecules (`src/components/ui/molecules/`)
- **`FormField.tsx`**: Composite container pairing a field label, `Input` atom, and animated error message text.
- **`StatBadge.tsx`**: Competitive readout molecule combining a game icon (`react-icons/gi`), numerical value, and label.
- **`TabNav.tsx`**: Segmented tab control with gradient active states for auth and menu switches.
- **`MenuCard.tsx`**: Prominent interactive cards featuring hover scale, glowing borders, status badges, and description copy.

### Organisms (`src/components/ui/organisms/`)
- **`LoginForm.tsx`**: Manages credential validation, loading state, and error handling for existing fighters.
- **`RegisterForm.tsx`**: Handles new account creation, validating player handle rules (3-24 characters) and password length.
- **`PlayerBanner.tsx`**: Persistent top bar showing fighter name, avatar, live K/D and Win Rate derived stats, and Sign Out.
- **`ProfileModal.tsx`**: Detailed fighter dossier displaying total matches, victories, defeats, kills, deaths, assists, K/D, and win rate.
- **`PauseMenuDialog.tsx`**: In-game dialog giving players the option to resume combat or withdraw cleanly to the main menu.
- **`ErrorDialog.tsx`**: Global modal alerting players to network disconnects or room admission failures.

### Templates (`src/components/ui/templates/`)
- **`ScreenLayout.tsx`**: Full-viewport responsive layout with ambient radial stadium lighting effects.
- **`ModalBackdrop.tsx`**: Accessible modal overlay with backdrop blur, click-outside dismissal, and `Escape` key listening.

---

## 2. Screen State Machine (`src/store/useNavigationStore.ts`)

The application navigation state is driven by a deterministic state machine:

| Screen | Description | Auth Guard |
| :--- | :--- | :---: |
| `AUTH` | Entry gate featuring the tabbed Login and Register forms. | No |
| `MAIN_MENU` | Central command hub with mode selection, tournament previews, and profile access. | **Yes** |
| `PLAY_MENU` | Combat mode selector (1v1 Arena, 3v3 Team, 4v4 Brawl, 20-Player FFA). | **Yes** |
| `MATCH_LOADING` | Transition view negotiating the Colyseus `onAuth` handshake and loading Havok physics. | **Yes** |
| `IN_GAME` | Active authoritative 3D combat viewport with heads-up display and pause overlay. | **Yes** |
| `MATCH_RESULTS` | Post-match summary and stats finalization screen. | **Yes** |

---

## 3. Typography & Graphical Polish

- **Primary Display Font**: **`Luckiest Guy`** (bouncy, chunky cartoon fighting aesthetic) and **`Bangers`** (comic-action arcade titles).
- **Technical & Numeric Font**: **`Chakra Petch`** (sharp, readable sci-fi arcade typography for stats and inputs).
- **Icons**: **`react-icons/gi`** (Game Icons — boxing gloves, fists, swords, trophies, shields) and **`react-icons/fa6`** (navigation icons).

---

## Phase 3 Progress Tracker

- [x] **Step 3.1**: Design centralized application screen state machine in Zustand (`useNavigationStore.ts`).
- [x] **Step 3.2**: Build reusable Atomic Design UI component library using Tailwind CSS (`atoms/`, `molecules/`, `organisms/`, `templates/`).
- [x] **Step 3.3**: Implement `AuthScreen` (Tabs for Login & Registration with clear error handling).
- [x] **Step 3.4**: Implement `MainMenuScreen` navigation hub (`PLAY`, `CHAMPIONSHIPS`, `CUSTOM ROOMS`, `PROFILE`, `SETTINGS`).
- [x] **Step 3.5**: Implement `MatchLoadingScreen` with animated indicators and connection state progress feedback.
- [x] **Step 3.6**: Implement global `ErrorDialog` and in-game HUD overlay with clean room leave actions.
