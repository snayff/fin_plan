/**
 * Modal Component (shadcn Dialog wrapper)
 *
 * Migration wrapper to maintain backward compatibility with existing code.
 * Uses shadcn Dialog component with our design tokens.
 */
import { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /**
   * Accessible description for the dialog. When provided it renders as visible
   * body text; when omitted a generic sr-only fallback keeps the dialog
   * labelled for assistive tech.
   */
  description?: ReactNode;
  children: ReactNode;
}

export default function Modal({ isOpen, onClose, title, description, children }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
