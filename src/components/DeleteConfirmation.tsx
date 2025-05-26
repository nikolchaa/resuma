// components/DeleteConfirmation.tsx
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

type DeleteConfirmationProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const DeleteConfirmation = ({
  open,
  onCancel,
  onConfirm,
}: DeleteConfirmationProps) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key='delete-confirmation'
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className='fixed inset-0 z-40 flex items-center justify-center bg-background/50 backdrop-blur-sm'
        >
          <div className='bg-background rounded-lg border shadow-lg w-full max-w-md p-6'>
            <h2 className='text-xl font-semibold'>Delete Resume?</h2>
            <p className='text-sm text-muted-foreground mt-2'>
              This action will permanently delete the resume and cannot be
              undone.
            </p>
            <div className='flex justify-end gap-2 mt-6'>
              <Button variant='outline' onClick={onCancel}>
                Cancel
              </Button>
              <Button variant='destructive' onClick={onConfirm}>
                Confirm
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
