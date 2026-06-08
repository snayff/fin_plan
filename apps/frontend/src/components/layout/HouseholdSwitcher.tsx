import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, ChevronDown, Plus, Settings } from "lucide-react";
import { householdService } from "@/services/household.service";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/authStore";
import { CreateHouseholdDialog } from "./CreateHouseholdDialog";

export function HouseholdSwitcher() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { data } = useQuery({
    queryKey: ["households"],
    queryFn: () => householdService.getHouseholds(),
    enabled: !!user,
  });

  const switchMutation = useMutation({
    mutationFn: (id: string) => householdService.switchHousehold(id),
    onSuccess: async () => {
      if (accessToken) {
        const { user: updatedUser } = await authService.getCurrentUser(accessToken);
        setUser(updatedUser, accessToken);
      }
      qc.invalidateQueries();
      navigate("/overview");
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to switch household");
    },
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => householdService.createHousehold(name),
    onSuccess: async () => {
      if (accessToken) {
        const { user: updatedUser } = await authService.getCurrentUser(accessToken);
        setUser(updatedUser, accessToken);
      }
      qc.invalidateQueries();
      navigate("/overview");
      setShowCreate(false);
      toast.success("Household created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create household");
    },
  });

  const households = data?.households ?? [];
  const activeId = user?.activeHouseholdId;
  const activeName =
    households.find((h) => h.household.id === activeId)?.household.name ?? "My household";

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors truncate max-w-[180px] px-2 py-1 rounded border border-transparent hover:bg-white/[0.02]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{activeName}</span>
        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Household options"
          className="absolute right-0 top-[calc(100%+6px)] min-w-[240px] max-w-[300px] bg-popover border rounded-md p-1.5 z-30 shadow-lg"
          style={{ maxHeight: "min(420px, calc(100vh - 70px))", overflowY: "auto" }}
          onKeyDown={(e) => {
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
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40 px-2.5 pt-1 pb-1">
            Switch household
          </p>
          {households.map(({ household }) => (
            <button
              key={household.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="flex items-center justify-between w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:bg-accent/12"
              onClick={() => {
                if (household.id !== activeId) switchMutation.mutate(household.id);
                else setIsOpen(false);
              }}
            >
              <span className="truncate">{household.name}</span>
              {household.id === activeId && <Check className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />}
            </button>
          ))}
          <div className="h-px bg-foreground/10 my-1.5" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:bg-accent/12"
            onClick={() => {
              setIsOpen(false);
              navigate("/settings/household");
            }}
          >
            <Settings className="h-3.5 w-3.5 text-foreground/40" aria-hidden="true" />
            Household settings
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-primary hover:bg-accent/12 transition-colors focus-visible:outline-none focus-visible:bg-accent/12"
            onClick={() => {
              setIsOpen(false);
              setShowCreate(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create new household
          </button>
        </div>
      )}

      <CreateHouseholdDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onConfirm={(name) => createMutation.mutate(name)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
