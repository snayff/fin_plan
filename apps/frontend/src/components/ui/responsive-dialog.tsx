/**
 * `ResponsiveDialogContent` — a drop-in replacement for `DialogContent` that
 * renders as a bottom-anchored sheet (default) or full-screen overlay on mobile,
 * and as the existing centred Radix Dialog on desktop.
 *
 * Variants (mobile only):
 *   - `"sheet"`     bottom-anchored sheet, used by all forms (Decision 4)
 *   - `"fullscreen"` full-viewport, used by the search palette (Decision 10)
 *
 * Desktop rendering is identical across variants — the existing centred Dialog.
 *
 * Usage:
 *   ```tsx
 *   import { Dialog, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 *   import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogTrigger asChild>...</DialogTrigger>
 *     <ResponsiveDialogContent variant="sheet">
 *       <DialogHeader><DialogTitle>...</DialogTitle></DialogHeader>
 *       ...
 *     </ResponsiveDialogContent>
 *   </Dialog>
 *   ```
 *
 * See docs/4. planning/mobile-accessibility/plan.md § Decision 4 + Decision 10.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

const DESKTOP_CLASSES =
  "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg";

const MOBILE_SHEET_CLASSES =
  "fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 border-t bg-background p-6 shadow-xl rounded-t-xl max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom";

const MOBILE_FULLSCREEN_CLASSES =
  "fixed inset-0 z-50 flex flex-col bg-background w-screen h-[100dvh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

type ResponsiveVariant = "sheet" | "fullscreen";

interface ResponsiveDialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /**
   * Mobile-only layout variant. Desktop ignores this and renders the centred Dialog.
   * Defaults to `"sheet"` (used by forms).
   */
  variant?: ResponsiveVariant;
  /**
   * Hide the built-in close button. Default `false`.
   * Pass `true` if the content provides its own dismissal affordance.
   */
  hideCloseButton?: boolean;
}

const ResponsiveDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ResponsiveDialogContentProps
>(({ variant = "sheet", className, children, hideCloseButton = false, ...props }, ref) => {
  const isMobile = useIsMobile();
  const layout = !isMobile
    ? DESKTOP_CLASSES
    : variant === "fullscreen"
      ? MOBILE_FULLSCREEN_CLASSES
      : MOBILE_SHEET_CLASSES;

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content ref={ref} className={cn(layout, className)} {...props}>
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

export { ResponsiveDialogContent };
export type { ResponsiveVariant };
