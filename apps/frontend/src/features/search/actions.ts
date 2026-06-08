export type PaletteAction = {
  id: string;
  label: string;
  kind: "nav" | "create";
  route: string;
  addParam?: string;
};

export const NAV_ACTIONS: PaletteAction[] = [
  { id: "nav.overview", label: "Go to Overview", kind: "nav", route: "/overview" },
  { id: "nav.income", label: "Go to Income", kind: "nav", route: "/income" },
  { id: "nav.committed", label: "Go to Committed", kind: "nav", route: "/committed" },
  { id: "nav.discretionary", label: "Go to Discretionary", kind: "nav", route: "/discretionary" },
  { id: "nav.surplus", label: "Go to Surplus", kind: "nav", route: "/surplus" },
  { id: "nav.forecast", label: "Go to Forecast", kind: "nav", route: "/forecast" },
  { id: "nav.assets", label: "Go to Assets", kind: "nav", route: "/assets" },
  { id: "nav.goals", label: "Go to Goals", kind: "nav", route: "/goals" },
  { id: "nav.gifts", label: "Go to Gifts", kind: "nav", route: "/gifts" },
  { id: "nav.help", label: "Go to Help", kind: "nav", route: "/help" },
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
  },
  {
    id: "create.gift-event",
    label: "Add gift event",
    kind: "create",
    route: "/gifts",
    addParam: "event",
  },
  {
    id: "create.purchase-item",
    label: "Add purchase item",
    kind: "create",
    route: "/goals",
    addParam: "1",
  },
];

export const ALL_ACTIONS: PaletteAction[] = [...NAV_ACTIONS, ...CREATE_ACTIONS];
