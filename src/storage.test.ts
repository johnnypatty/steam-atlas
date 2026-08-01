import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATLAS_DATA_SCHEMA,
  emptyWorkspace,
  loadAtlasData,
  normalizeWorkspace,
  parseAtlasData,
  withWorkspace
} from "./storage";

const storage = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null,
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: Object.keys(values).length
});

afterEach(() => vi.unstubAllGlobals());

describe("Atlas data migrations", () => {
  it("migrates legacy backlog and launch profiles without deleting either source", () => {
    vi.stubGlobal("localStorage", storage({
      "atlas.backlog": JSON.stringify([{ appId: "730", status: "Completed" }]),
      "atlas.launchProfiles": JSON.stringify([{ id: "legacy", appId: "730", name: "Safe mode", args: "-safe" }])
    }));
    const data = loadAtlasData();
    expect(data.schemaVersion).toBe(ATLAS_DATA_SCHEMA);
    expect(data.workspaces["730"].status).toBe("Finished");
    expect(data.workspaces["730"].launchProfiles[0]).toMatchObject({
      id: "legacy",
      name: "Safe mode",
      arguments: ["-safe"]
    });
  });

  it("falls back safely when stored JSON is malformed", () => {
    vi.stubGlobal("localStorage", storage({
      "atlas.userData": "{not-json",
      "atlas.backlog": "also-invalid"
    }));
    expect(loadAtlasData()).toMatchObject({
      schemaVersion: ATLAS_DATA_SCHEMA,
      workspaces: {},
      sessions: []
    });
  });
});

describe("workspace normalization", () => {
  it("bounds ratings, removes duplicate tags, and rejects an unknown status", () => {
    const workspace = normalizeWorkspace({
      rating: 99,
      status: "Unknown" as never,
      tags: ["RPG", "RPG", "", "  story  "]
    }, "570");
    expect(workspace.rating).toBe(10);
    expect(workspace.status).toBe("Backlog");
    expect(workspace.tags).toEqual(["RPG", "story"]);
  });

  it("updates one workspace without mutating the previous data object", () => {
    const original = { schemaVersion: ATLAS_DATA_SCHEMA, workspaces: {}, sessions: [] };
    const next = withWorkspace(original, "440", (workspace) => ({ ...workspace, favorite: true }));
    expect(next).not.toBe(original);
    expect(next.workspaces["440"].favorite).toBe(true);
    expect(original.workspaces).toEqual({});
  });

  it("creates a complete empty workspace", () => {
    expect(emptyWorkspace("10")).toMatchObject({
      appId: "10",
      favorite: false,
      status: "Backlog",
      saveLocations: [],
      launchProfiles: []
    });
  });

  it("normalizes a versioned native data document", () => {
    const data = parseAtlasData(JSON.stringify({
      schemaVersion: 1,
      workspaces: {
        "730": { appId: "wrong", rating: -3, status: "Playing", tags: ["FPS"] },
        invalid: { favorite: true }
      },
      sessions: []
    }));
    expect(data.workspaces["730"]).toMatchObject({ appId: "730", rating: 0, status: "Playing" });
    expect(data.workspaces.invalid).toBeUndefined();
  });
});
