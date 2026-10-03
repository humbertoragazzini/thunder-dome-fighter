// ==================================================
// ORGANISM: GLOBAL ERROR DIALOG COMPONENT
//
// WHAT IT DOES:
// Displays a critical alert dialog when network drops, room join rejections,
// or authentication timeouts occur.
//
// HOW IT WORKS:
// - Listens to `useNavigationStore.activeModal === "ERROR"`.
// - Displays the formatted error message with a pulsing warning icon.
// - Provides a clear "Acknowledge" button that safely returns the user
//   to the Main Menu or Auth Screen.
//
// WHY IT EXISTS:
// Prevents silent crashes and unhandled connection dropouts from leaving the user stranded.
// ==================================================

import { FaTriangleExclamation } from "react-icons/fa6";
import { useAuthStore } from "../../../store/useAuthStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Button } from "../atoms/Button";
import { ModalBackdrop } from "../templates/ModalBackdrop";

export function ErrorDialog() {
  const activeModal = useNavigationStore((state) => state.activeModal);
  const errorMessage = useNavigationStore((state) => state.errorMessage);
  const closeModal = useNavigationStore((state) => state.closeModal);
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const isOpen = activeModal === "ERROR";

  const handleAcknowledge = () => {
    closeModal();
    if (isAuthenticated) {
      navigateTo("MAIN_MENU");
    } else {
      navigateTo("AUTH");
    }
  };

  return (
    <ModalBackdrop
      isOpen={isOpen}
      onClose={handleAcknowledge}
      title="Connection Alert"
      icon={<FaTriangleExclamation className="text-red-400" />}
      maxWidth="sm"
    >
      <div className="flex flex-col items-center text-center gap-5">
        <div className="w-16 h-16 rounded-full bg-red-950/80 border-2 border-red-500/50 flex items-center justify-center text-red-400 text-3xl shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse">
          <FaTriangleExclamation />
        </div>

        <div className="flex flex-col gap-1.5">
          <h4
            className="text-lg font-black uppercase text-slate-100"
            style={{ fontFamily: "var(--font-game)" }}
          >
            Arena Alert
          </h4>
          <p
            className="text-sm text-slate-300 leading-relaxed"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            {errorMessage || "An unexpected network or arena interruption occurred."}
          </p>
        </div>

        <Button
          variant="danger"
          size="md"
          onClick={handleAcknowledge}
          className="w-full"
        >
          Return to Safety
        </Button>
      </div>
    </ModalBackdrop>
  );
}
