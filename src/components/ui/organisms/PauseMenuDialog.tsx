// ==================================================
// ORGANISM: IN-GAME PAUSE MENU DIALOG
//
// WHAT IT DOES:
// Renders an in-game pause dialog allowing fighters to resume combat
// or cleanly withdraw from the authoritative Colyseus room.
//
// HOW IT WORKS:
// - Can be triggered by pressing `Escape` or clicking the Pause button in the HUD.
// - "Resume Fight": Dismisses the pause dialog and restores focus.
// - "Leave Arena": Leaves the Colyseus room (`room.leave()`), cleans up the room reference,
//   and transitions the client back to `MAIN_MENU`.
//
// WHY IT EXISTS:
// Gives players control to exit active matches gracefully without closing the tab.
// ==================================================

import { FaDoorOpen, FaPlay } from "react-icons/fa6";
import { GiPauseButton } from "react-icons/gi";
import { useAppStore } from "../../../store/useAppStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Button } from "../atoms/Button";
import { ModalBackdrop } from "../templates/ModalBackdrop";

export interface PauseMenuDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PauseMenuDialog({ isOpen, onClose }: PauseMenuDialogProps) {
  const room = useAppStore((state) => state.room);
  const setRoom = useAppStore((state) => state.setRoom);
  const navigateTo = useNavigationStore((state) => state.navigateTo);

  const handleLeaveArena = async () => {
    onClose();
    if (room) {
      try {
        await room.leave();
      } catch (err) {
        console.warn("Error leaving room:", err);
      }
      setRoom(null);
    }
    navigateTo("MAIN_MENU");
  };

  return (
    <ModalBackdrop
      isOpen={isOpen}
      onClose={onClose}
      title="Combat Paused"
      icon={<GiPauseButton />}
      maxWidth="sm"
    >
      <div className="flex flex-col gap-4 text-center">
        <p
          className="text-sm text-slate-300"
          style={{ fontFamily: "var(--font-tech)" }}
        >
          The authoritative simulation continues in the arena. Are you sure you want to withdraw?
        </p>

        <div className="flex flex-col gap-2.5 pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={onClose}
            leftIcon={<FaPlay />}
            className="w-full"
          >
            Resume Fight
          </Button>

          <Button
            variant="danger"
            size="md"
            onClick={handleLeaveArena}
            leftIcon={<FaDoorOpen />}
            className="w-full"
          >
            Leave Arena
          </Button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
