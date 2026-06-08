export function uniqueEmail(prefix = "user"): string {
  return `e2e+${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@finplan.test`;
}
