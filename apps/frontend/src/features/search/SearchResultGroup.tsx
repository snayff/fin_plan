import { Command } from "cmdk";
import type { ReactNode } from "react";

type Props = { heading: string; children: ReactNode; hidden?: boolean };

export function SearchResultGroup({ heading, children, hidden }: Props) {
  if (hidden) return null;
  return (
    <Command.Group heading={heading} className="label-detail px-3 pt-2">
      {children}
    </Command.Group>
  );
}
