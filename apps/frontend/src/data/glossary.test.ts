import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GLOSSARY_ENTRIES, getGlossaryEntry, type GlossaryTag } from "./glossary";

// definitions.md is the canonical source for every tooltip term. The glossary
// must mirror it exactly (one entry per term), so parity is asserted against the
// live doc rather than a hardcoded count — that way drift fails the build.
const DEFINITIONS_PATH = join(import.meta.dir, "../../../../docs/2. design/definitions.md");

function definitionTerms(): string[] {
  const md = readFileSync(DEFINITIONS_PATH, "utf-8");
  return md
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());
}

describe("GLOSSARY_ENTRIES", () => {
  it("contains one entry per canonical definition in definitions.md", () => {
    expect(GLOSSARY_ENTRIES.length).toBe(definitionTerms().length);
  });

  it("covers every term defined in definitions.md (no missing terms)", () => {
    const glossaryTerms = new Set(GLOSSARY_ENTRIES.map((e) => e.term));
    const missing = definitionTerms().filter((t) => !glossaryTerms.has(t));
    expect(missing).toEqual([]);
  });

  it("has no glossary term that is absent from definitions.md (no orphans)", () => {
    const defined = new Set(definitionTerms());
    const orphans = GLOSSARY_ENTRIES.map((e) => e.term).filter((t) => !defined.has(t));
    expect(orphans).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = GLOSSARY_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each entry has required fields", () => {
    for (const entry of GLOSSARY_ENTRIES) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.term).toBe("string");
      expect(typeof entry.definition).toBe("string");
      expect(Array.isArray(entry.relatedConceptIds)).toBe(true);
      expect(Array.isArray(entry.appearsIn)).toBe(true);
    }
  });

  it("entries are sorted alphabetically by term", () => {
    const terms = GLOSSARY_ENTRIES.map((e) => e.term);
    const sorted = [...terms].sort((a, b) => a.localeCompare(b));
    expect(terms).toEqual(sorted);
  });

  it("every entry has a valid tag", () => {
    const validTags: GlossaryTag[] = ["financial", "finplan"];
    for (const entry of GLOSSARY_ENTRIES) {
      expect(validTags).toContain(entry.tag);
    }
  });

  it("no entry references itself in relatedConceptIds", () => {
    for (const entry of GLOSSARY_ENTRIES) {
      expect(entry.relatedConceptIds).not.toContain(entry.id);
    }
  });

  it("no entry references itself in relatedTermIds", () => {
    for (const entry of GLOSSARY_ENTRIES) {
      expect(entry.relatedTermIds).not.toContain(entry.id);
    }
  });
});

describe("getGlossaryEntry", () => {
  it("returns entry by id", () => {
    const entry = getGlossaryEntry("waterfall");
    expect(entry?.term).toBe("Waterfall");
  });

  it("returns undefined for unknown id", () => {
    expect(getGlossaryEntry("unknown-id")).toBeUndefined();
  });
});
