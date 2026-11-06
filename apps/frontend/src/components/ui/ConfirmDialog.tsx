/**
 * ConfirmDialog Component (shadcn AlertDialog wrapper)
 *
 * Migration wrapper to maintain backward compatibility.
 * Uses shadcn AlertDialog with our design tokens.
 * Follows design principle: supportive, not supervisory
 */
import { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { cn } from "../../lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  variant?: "danger" | "warning" | "info";
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  variant = "warning",
}: ConfirmDialogProps) {
  // Map variants to our design token system
  const variantStyles = {
    danger: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
    warning: "bg-attention hover:bg-attention/90 text-foreground",
    info: "bg-primary hover:bg-primary-hover text-primary-foreground",
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isLoading}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(variantStyles[variant])}
          >
            {isLoading ? "Processing..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
