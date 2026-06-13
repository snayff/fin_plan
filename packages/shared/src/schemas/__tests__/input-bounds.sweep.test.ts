import { describe, it, expect } from "bun:test";
import { z } from "zod";
import * as schemaExports from "../index";

/**
 * Systematic bounds sweep.
 *
 * Walks every exported input schema (create/update/upsert/query/…) and
 * asserts that every numeric leaf rejects non-finite and astronomically
 * large values, and every string leaf rejects megabyte payloads. This
 * complements the hand-written cases in input-bounds.test.ts by covering
 * fields added in the future automatically.
 */

const INPUT_NAME =
  /^(create|update|upsert|set|record|rename|accept|confirm|delete|batch|bulk|reset|import|staleness|confirmed|updated)/i;
const QUERY_NAME = /query/i;
/** Output-only shapes — not parsed from user input. */
const EXCLUDE = /(response|result|row|point|summary|projection)/i;
/** Input schemas whose names don't match the patterns above. */
const EXTRA_INPUT_SCHEMAS = new Set(["householdExportSchema"]);

const HOSTILE_NUMBERS: ReadonlyArray<readonly [string, number]> = [
  ["Infinity", Infinity],
  ["-Infinity", -Infinity],
  ["NaN", NaN],
  ["1e308", 1e308],
  ["-1e308", -1e308],
];
const MEGABYTE_STRING = "x".repeat(1_000_000);

// Minimal structural view of zod v3 internals used for traversal.
interface AnyDef {
  typeName: string;
  innerType?: z.ZodTypeAny;
  schema?: z.ZodTypeAny;
  type?: z.ZodTypeAny;
  shape?: () => Record<string, z.ZodTypeAny>;
  valueType?: z.ZodTypeAny;
  keyType?: z.ZodTypeAny;
  items?: z.ZodTypeAny[];
  options?: z.ZodTypeAny[];
  left?: z.ZodTypeAny;
  right?: z.ZodTypeAny;
  getter?: () => z.ZodTypeAny;
  in?: z.ZodTypeAny;
}

const defOf = (t: z.ZodTypeAny): AnyDef => t._def as AnyDef;

function unwrap(t: z.ZodTypeAny): z.ZodTypeAny {
  for (;;) {
    const def = defOf(t);
    switch (def.typeName) {
      case "ZodOptional":
      case "ZodNullable":
      case "ZodDefault":
      case "ZodCatch":
      case "ZodReadonly":
        t = def.innerType!;
        break;
      case "ZodEffects":
        t = def.schema!;
        break;
      case "ZodBranded":
        t = def.type!;
        break;
      default:
        return t;
    }
  }
}

interface SweepState {
  leavesProbed: number;
  violations: string[];
}

function probeLeaf(t: z.ZodTypeAny, kind: string, name: string, path: string, state: SweepState) {
  state.leavesProbed++;
  if (kind === "ZodNumber") {
    for (const [label, value] of HOSTILE_NUMBERS) {
      if (t.safeParse(value).success) {
        state.violations.push(`${name} :: ${path} accepts ${label}`);
      }
    }
  } else if (kind === "ZodString") {
    if (t.safeParse(MEGABYTE_STRING).success) {
      state.violations.push(`${name} :: ${path} accepts a 1MB string`);
    }
  }
}

function walk(t: z.ZodTypeAny, name: string, path: string, depth: number, state: SweepState) {
  if (depth > 12) return;
  t = unwrap(t);
  const def = defOf(t);
  switch (def.typeName) {
    case "ZodObject": {
      const shape = def.shape!();
      for (const key of Object.keys(shape)) {
        walk(shape[key]!, name, path ? `${path}.${key}` : key, depth + 1, state);
      }
      return;
    }
    case "ZodArray":
      walk(def.type!, name, `${path}[*]`, depth + 1, state);
      return;
    case "ZodRecord":
      walk(def.valueType!, name, `${path}{value}`, depth + 1, state);
      return;
    case "ZodMap":
      walk(def.keyType!, name, `${path}{key}`, depth + 1, state);
      walk(def.valueType!, name, `${path}{value}`, depth + 1, state);
      return;
    case "ZodTuple":
      def.items!.forEach((item, i) => walk(item, name, `${path}[${i}]`, depth + 1, state));
      return;
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      def.options!.forEach((option, i) => walk(option, name, `${path}|${i}`, depth + 1, state));
      return;
    case "ZodIntersection":
      walk(def.left!, name, `${path}&left`, depth + 1, state);
      walk(def.right!, name, `${path}&right`, depth + 1, state);
      return;
    case "ZodLazy":
      walk(def.getter!(), name, path, depth + 1, state);
      return;
    case "ZodPipeline":
      // Probe the whole pipeline (covers z.coerce.number().pipe(...)).
      probeLeaf(t, defOf(unwrap(def.in!)).typeName, name, path, state);
      return;
    case "ZodNumber":
    case "ZodString":
      probeLeaf(t, def.typeName, name, path, state);
      return;
    default:
      return; // enums, dates, booleans, literals, etc.
  }
}

function collectInputSchemas(): Array<[string, z.ZodTypeAny]> {
  const result: Array<[string, z.ZodTypeAny]> = [];
  for (const [name, value] of Object.entries(schemaExports)) {
    if (!(value instanceof z.ZodType)) continue;
    if (EXTRA_INPUT_SCHEMAS.has(name)) {
      result.push([name, value as z.ZodTypeAny]);
      continue;
    }
    if (EXCLUDE.test(name)) continue;
    if (!INPUT_NAME.test(name) && !QUERY_NAME.test(name)) continue;
    result.push([name, value as z.ZodTypeAny]);
  }
  return result;
}

describe("input schema bounds sweep", () => {
  const inputSchemas = collectInputSchemas();

  it("finds a meaningful number of input schemas (guards against filter drift)", () => {
    expect(inputSchemas.length).toBeGreaterThanOrEqual(60);
  });

  it("every numeric and string field in every input schema is bounded", () => {
    const state: SweepState = { leavesProbed: 0, violations: [] };
    for (const [name, schema] of inputSchemas) {
      walk(schema, name, "", 0, state);
    }
    // Guard against the walker silently probing nothing.
    expect(state.leavesProbed).toBeGreaterThanOrEqual(250);
    expect(state.violations).toEqual([]);
  });
});
