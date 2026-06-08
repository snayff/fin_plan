import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User } from "lucide-react";

interface ProfileAvatarDropdownProps {
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  onClose: () => void;
}

export const ProfileAvatarDropdown = forwardRef<HTMLDivElement, ProfileAvatarDropdownProps>(
  function ProfileAvatarDropdown({ userName, userEmail, onSignOut, onClose }, ref) {
    const navigate = useNavigate();
    return (
      <div
        ref={ref}
        role="menu"
        aria-label="Profile options"
        className="absolute right-0 top-[calc(100%+6px)] min-w-[220px] max-w-[300px] bg-popover border rounded-md p-1.5 z-30 shadow-lg"
        style={{ maxHeight: "min(420px, calc(100vh - 70px))", overflowY: "auto" }}
      >
        <div className="px-2.5 pt-1 pb-1">
          <div className="text-sm font-semibold text-foreground truncate">{userName}</div>
          <div className="text-xs text-foreground/40 truncate">{userEmail}</div>
        </div>
        <div className="h-px bg-foreground/10 my-1.5" />
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onClose();
            navigate("/settings/profile");
          }}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:bg-accent/12"
        >
          <User className="h-3.5 w-3.5 text-foreground/40" aria-hidden="true" />
          Profile settings
        </button>
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onClose();
            onSignOut();
          }}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:bg-accent/12"
        >
          <LogOut className="h-3.5 w-3.5 text-foreground/40" aria-hidden="true" />
          Sign out
        </button>
      </div>
    );
  }
);
