import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";

type ConfirmationModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary"; // Tailwind variants
};

export const ConfirmationModal = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
  confirmVariant = "default",
}: ConfirmationModalProps) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key='confirmation-modal'
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className='fixed inset-0 z-40 flex items-center justify-center bg-background/50 backdrop-blur-sm'
        >
          <div className='bg-background rounded-lg border shadow-lg w-full max-w-md p-6'>
            <h2 className='text-xl font-semibold'>{title}</h2>
            {description && (
              <p className='text-sm text-muted-foreground mt-2'>
                {description}
              </p>
            )}
            <div className='flex justify-end gap-2 mt-6'>
              <Button variant='outline' onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button variant={confirmVariant} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
