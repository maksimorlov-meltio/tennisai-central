// ============================================================================
// The drill document schema — the rules that keep the library usable.
//
// Every case here is a mistake a human (or an agent) will actually make: a cone
// placed off the planet, a cue nobody can shout, somebody else's words with no
// name attached, a tag invented on the spot, and a half-court diagram drawn on
// both sides of the net. Each must fail LOUDLY at validation time, because none
// of them is visible once the drill is a row in Postgres.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { drillDocumentSchema, courtExtents, MAX_CUE_WORDS } from "./drillSchema";
import { DRILLS_DIR } from "./vocab";

const EXEMPLAR = resolve(DRILLS_DIR, "tactics", "serve-plus-one-open-court.yaml");

/** A real, committed exemplar — the fixture is the shipping content itself. */
function loadExemplar(): Record<string, unknown> {
  return parseYaml(readFileSync(EXEMPLAR, "utf8")) as Record<string, unknown>;
}

/** Deep-ish clone so a mutation in one case cannot leak into the next. */
function mutate(fn: (doc: any) => void): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(loadExemplar()));
  fn(doc);
  return doc;
}

const messages = (result: ReturnType<typeof drillDocumentSchema.safeParse>) =>
  result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

describe("drillDocumentSchema", () => {
  it("parses a committed exemplar", () => {
    const result = drillDocumentSchema.safeParse(loadExemplar());
    expect(messages(result)).toEqual([]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("serve-plus-one-open-court");
      expect(result.data.taxonomy.domain).toBe("tactics");
      expect(result.data.blockKinds).toContain("tactical");
    }
  });

  it("rejects a marker outside the court plus run-off", () => {
    const { maxX } = courtExtents("full");
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.diagram.markers[0].x = maxX + 0.5;
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/diagram\.markers\.0.*outside the court plus run-off/);
  });

  it("rejects a path point outside the court plus run-off", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.diagram.paths[0].points[1].y = 40;
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/diagram\.paths\.0\.points\.1.*outside the court plus run-off/);
  });

  it(`rejects a cue longer than ${MAX_CUE_WORDS} words`, () => {
    const nineWords = "Serve out wide and then step inside the baseline";
    expect(nineWords.split(" ")).toHaveLength(9);
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.cues.en[0] = nineWords;
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/cues\.en\.0: cue is 9 words — the limit is 8/);
  });

  it("rejects a quoted cue with no attribution", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.cues.en[0] = { text: "Hit up on the ball", quote: true };
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/cues\.en\.0: a quoted cue must name its attribution/);
  });

  it("accepts a quoted cue that names its attribution", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.cues.en[0] = { text: "Hit up on the ball", quote: true, attribution: "Lawn Tennis Association" };
      }),
    );
    expect(messages(result)).toEqual([]);
  });

  it("rejects a skill that is not in the vocabulary", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.taxonomy.skills.push("forehand_wizardry");
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/unknown skill "forehand_wizardry"/);
  });

  it("rejects a pattern that is not in the vocabulary", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.taxonomy.patterns = ["secret_pattern"];
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/unknown pattern "secret_pattern"/);
  });

  it("rejects a half-court diagram drawn on both sides of the net", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.diagram.court = "half";
        d.diagram.markers[0].y = 5;
        d.diagram.markers[1].y = -5;
        d.diagram.paths = [];
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/every y on one side of the net/);
  });

  it("rejects a reviewed drill whose only source has an http URL", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.sources = [
          {
            coachOrBody: "Somebody",
            title: "A page",
            medium: "article",
            url: "http://example.org/a",
          },
        ];
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/may only cite https URLs/);
  });

  it("rejects defaults that fall outside their declared range", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.defaults.durationMin = 99;
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/defaults\.durationMin \(99\) is outside ranges\.durationMin/);
  });

  it("requires the supervision flag on under-14 strength work", () => {
    const result = drillDocumentSchema.safeParse(
      mutate((d) => {
        d.taxonomy.domain = "physical";
        d.taxonomy.skills = ["lower_body_strength"];
        d.taxonomy.patterns = [];
        d.ageBands = ["u12", "u14"];
        d.requiresQualifiedSupervision = false;
      }),
    );
    expect(result.success).toBe(false);
    expect(messages(result).join("\n")).toMatch(/must be flagged requiresQualifiedSupervision/);
  });
});
