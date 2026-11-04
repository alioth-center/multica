import { z } from "zod";

export const dependencyGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      identifier: z.string(),
      title: z.string(),
      status: z.string(),
    }),
  ),
  edges: z.array(z.object({ prerequisite: z.string(), dependent: z.string() })),
});

export type DependencyGraph = z.infer<typeof dependencyGraphSchema>;
