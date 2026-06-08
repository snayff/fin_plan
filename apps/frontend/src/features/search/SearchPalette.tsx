import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { SearchResultRow } from "./SearchResultRow";
import { SearchResultGroup } from "./SearchResultGroup";
import { useSearchQuery } from "./useSearchQuery";
import { useSearchRecents, type RecentEntry } from "./useSearchRecents";
import type { PaletteAction } from "./actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
};

export function SearchPalette({ open, onOpenChange, userId }: Props) {
  const [query, setQuery] = useState("");
  const { groups } = useSearchQuery(query);
  const { list: recents, push } = useSearchRecents(userId);
  const navigate = useNavigate();

  const close = () => {
    setQuery("");
    onOpenChange(false);
  };

  const navigateTo = (route: string, params?: Record<string, string>) => {
    const search = params ? `?${new URLSearchParams(params).toString()}` : "";
    navigate(`${route}${search}`);
    close();
  };

  const selectData = (r: {
    kind: string;
    id: string;
    name: string;
    subtitle: string;
    route: string;
    focusId: string;
  }) => {
    push({
      kind: "data",
      id: r.id,
      label: r.name,
      subtitle: r.subtitle,
      route: r.route,
      focusId: r.focusId,
    });
    navigateTo(r.route, { focus: r.focusId });
  };

  const selectHelp = (h: { id: string; title: string; subtitle: string }) => {
    push({
      kind: "help",
      id: h.id,
      label: h.title,
      subtitle: h.subtitle,
      route: "/help",
    });
    navigateTo("/help", { entry: h.id });
  };

  const selectAction = (a: PaletteAction) => {
    push({
      kind: a.kind === "create" ? "create" : "nav",
      id: a.id,
      label: a.label,
      subtitle: a.kind === "create" ? "Action · Create" : "Action · Navigate",
      route: a.route,
      addParam: a.addParam,
    });
    navigateTo(a.route, a.addParam ? { add: a.addParam } : undefined);
  };

  const selectRecent = (r: RecentEntry) => {
    if (r.kind === "data" && r.focusId) return navigateTo(r.route, { focus: r.focusId });
    if (r.kind === "help") return navigateTo(r.route, { entry: r.id });
    if (r.kind === "create" && r.addParam) return navigateTo(r.route, { add: r.addParam });
    return navigateTo(r.route);
  };

  const isEmptyQuery = query.trim().length === 0;
  const hasAnyResults =
    groups.data.length > 0 || groups.help.length > 0 || groups.actions.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/60 backdrop-blur-[1px] z-40" />
        <Dialog.Content
          className="fixed left-0 right-0 top-0 z-50 mx-auto max-w-3xl"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command
            label="Universal search"
            className="bg-background border border-foreground/10 rounded-b-md shadow-lg overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-foreground/5">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search..."
                className="w-full bg-transparent outline-none text-sm text-foreground"
                autoFocus
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto min-h-0">
              {isEmptyQuery ? (
                recents.length === 0 ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="px-3 py-6 text-xs text-foreground/50"
                  >
                    Start typing to search…
                  </div>
                ) : (
                  <SearchResultGroup heading="Recent">
                    {recents.map((r) => (
                      <SearchResultRow
                        key={`${r.kind}:${r.id}`}
                        value={`recent::${r.kind}::${r.id}`}
                        title={r.label}
                        subtitle={r.subtitle}
                        onSelect={() => selectRecent(r)}
                      />
                    ))}
                  </SearchResultGroup>
                )
              ) : !hasAnyResults ? (
                <Command.Empty className="px-3 py-6 text-xs text-foreground/50">
                  No results
                </Command.Empty>
              ) : (
                <>
                  <SearchResultGroup heading="Data" hidden={groups.data.length === 0}>
                    {groups.data.map((r) => (
                      <SearchResultRow
                        key={`data::${r.kind}::${r.id}`}
                        value={`data::${r.kind}::${r.id}`}
                        title={r.name}
                        subtitle={r.subtitle}
                        onSelect={() => selectData(r)}
                      />
                    ))}
                  </SearchResultGroup>
                  <SearchResultGroup heading="Help" hidden={groups.help.length === 0}>
                    {groups.help.map((h) => (
                      <SearchResultRow
                        key={`help::${h.id}`}
                        value={`help::${h.id}`}
                        title={h.title}
                        subtitle={h.subtitle}
                        onSelect={() => selectHelp(h)}
                      />
                    ))}
                  </SearchResultGroup>
                  <SearchResultGroup heading="Actions" hidden={groups.actions.length === 0}>
                    {groups.actions.map((a) => (
                      <SearchResultRow
                        key={`action::${a.id}`}
                        value={`action::${a.id}`}
                        title={a.label}
                        subtitle={a.kind === "create" ? "Action · Create" : "Action · Navigate"}
                        onSelect={() => selectAction(a)}
                      />
                    ))}
                  </SearchResultGroup>
                </>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
