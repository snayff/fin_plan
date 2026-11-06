export type PaletteAction = {
  id: string;
  label: string;
  kind: "nav" | "create";
  route: string;
  addParam?: string;
  /**
   * `true` when the route is soft-blocked on mobile. The palette renders a
   * "(desktop only)" badge alongside such entries; tapping still navigates,
   * which lands on the MobileUnsupportedNotice. See docs/5. built/ui/universal-search/universal-search-spec.md § Mobile (amended).
   */
  desktopOnly?: boolean;
};

export const NAV_ACTIONS: PaletteAction[] = [
  { id: "nav.overview", label: "Go to Overview", kind: "nav", route: "/overview" },
  { id: "nav.income", label: "Go to Income", kind: "nav", route: "/income" },
  { id: "nav.committed", label: "Go to Committed", kind: "nav", route: "/committed" },
  { id: "nav.discretionary", label: "Go to Discretionary", kind: "nav", route: "/discretionary" },
  { id: "nav.surplus", label: "Go to Surplus", kind: "nav", route: "/surplus" },
  { id: "nav.forecast", label: "Go to Forecast", kind: "nav", route: "/forecast" },
  { id: "nav.assets", label: "Go to Assets", kind: "nav", route: "/assets" },
  { id: "nav.goals", label: "Go to Goals", kind: "nav", route: "/goals", desktopOnly: true },
  { id: "nav.gifts", label: "Go to Gifts", kind: "nav", route: "/gifts", desktopOnly: true },
  { id: "nav.help", label: "Go to Help", kind: "nav", route: "/help", desktopOnly: true },
  {
    id: "nav.settings.profile",
    label: "Go to Profile Settings",
    kind: "nav",
    route: "/settings/profile",
  },
  {
    id: "nav.settings.household",
    label: "Go to Household Settings",
    kind: "nav",
    route: "/settings/household",
    desktopOnly: true,
  },
];

export const CREATE_ACTIONS: PaletteAction[] = [
  {
    id: "create.income",
    label: "Add income source",
    kind: "create",
    route: "/income",
    addParam: "1",
  },
  {
    id: "create.committed",
    label: "Add committed item",
    kind: "create",
    route: "/committed",
    addParam: "1",
  },
  {
    id: "create.discretionary",
    label: "Add discretionary item",
    kind: "create",
    route: "/discretionary",
    addParam: "1",
  },
  { id: "create.asset", label: "Add asset", kind: "create", route: "/assets", addParam: "asset" },
  {
    id: "create.account",
    label: "Add account",
    kind: "create",
    route: "/assets",
    addParam: "account",
  },
  {
    id: "create.gift-person",
    label: "Add gift recipient",
    kind: "create",
    route: "/gifts",
    addParam: "person",
    desktopOnly: true,
  },
  {
    id: "create.gift-event",
    label: "Add gift event",
    kind: "create",
    route: "/gifts",
    addParam: "event",
    desktopOnly: true,
  },
];

export const ALL_ACTIONS: PaletteAction[] = [...NAV_ACTIONS, ...CREATE_ACTIONS];

/**
 * `true` when `route` soft-blocks on mobile, per the nav actions' flags. Data
 * results and recents have no flag of their own, so the palette badges them
 * by where they land.
 */
export function isDesktopOnlyRoute(route: string): boolean {
  return NAV_ACTIONS.some((a) => a.desktopOnly === true && a.route === route);
}
