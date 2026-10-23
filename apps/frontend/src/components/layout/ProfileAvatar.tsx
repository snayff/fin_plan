import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { ProfileAvatarDropdown } from "./ProfileAvatarDropdown";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  const firstChar = first[0] ?? "";
  const lastChar = last[0] ?? "";
  return (firstChar + lastChar).toUpperCase() || "?";
}

function hashHue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function ProfileAvatar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
        );
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next =
          e.key === "ArrowDown"
            ? items[(idx + 1) % items.length]
            : items[(idx - 1 + items.length) % items.length];
        next?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  const handleSignOut = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  if (!user) return null;
  const initials = getInitials(user.name ?? user.email ?? "?");
  const hue = hashHue(user.name ?? user.email ?? "x");

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        // Visible initials must be part of the accessible name (WCAG 2.5.3) so
        // voice-control users can activate the button by what they see.
        aria-label={`${initials}, profile menu`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8 rounded-full flex items-center justify-center font-heading font-bold text-xs text-white border-2 border-transparent hover:border-action/40 active:scale-[0.97] transition-[transform,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/60"
        style={{
          background: `linear-gradient(135deg, hsl(${hue}, 60%, 55%) 0%, hsl(${(hue + 60) % 360}, 70%, 60%) 100%)`,
        }}
      >
        {initials}
      </button>
      {open && (
        <ProfileAvatarDropdown
          ref={menuRef}
          userName={user.name ?? user.email ?? ""}
          userEmail={user.email ?? ""}
          onSignOut={handleSignOut}
          onClose={close}
        />
      )}
    </div>
  );
}
