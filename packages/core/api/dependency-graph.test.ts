// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

it.each([{ nodes: [] }, { nodes: [], edges: [{ dependent: 42 }] }])(
  "falls back when the project graph response is incomplete or malformed",
  async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect(
      await new ApiClient("https://api.example.test").projectDependencyGraph(
        "p1",
      ),
    ).toEqual({ nodes: [], edges: [] });
  },
);
