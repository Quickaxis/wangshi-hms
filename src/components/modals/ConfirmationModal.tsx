import { GlassModal } from "../ui/GlassModal";
import { GlassButton } from "../ui/GlassButton";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
}

export function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message,
  confirmText = "Confirm"
}: ConfirmationModalProps) {
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton variant="primary" onClick={onConfirm}>
            {confirmText}
          </GlassButton>
        </>
      }
    >
      <p className="text-[#C7C3BA] text-sm">
        {message}
      </p>
    </GlassModal>
  );
}
