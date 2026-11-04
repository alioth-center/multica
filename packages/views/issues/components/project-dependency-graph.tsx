"use client";

import { useId, useMemo } from "react";
import dagre from "@dagrejs/dagre";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useIssueStatuses } from "@multica/core/issue-statuses/hooks";
import {
  dependencyGraphOptions,
  type DependencyGraph,
} from "@multica/core/issues/dependencies";
import { Button } from "@multica/ui/components/ui/button";
import { useT } from "../../i18n";
import { useIssuePeekActions } from "../surface/peek-context";

const width = 208;
const height = 80;

function positionGraph(data: DependencyGraph) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    marginx: 20,
    marginy: 20,
    nodesep: 18,
    ranksep: 60,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of data.nodes)
    graph.setNode(node.id, { width, height, identifier: node.identifier });
  for (const edge of data.edges) {
    if (graph.hasNode(edge.prerequisite) && graph.hasNode(edge.dependent)) {
      graph.setEdge(edge.prerequisite, edge.dependent);
    }
  }
  dagre.layout(graph);
  return graph;
}

export default function ProjectDependencyGraph({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useT("issues");
  const wsId = useWorkspaceId();
  const query = useQuery(dependencyGraphOptions(wsId, projectId));
  const statuses = useIssueStatuses(wsId);
  const peek = useIssuePeekActions();
  const arrow = useId();
  const data = query.data;
  const graph = useMemo(
    () => (data?.nodes.length ? positionGraph(data) : null),
    [data],
  );

  if (query.isError)
    return (
      <Button
        className="self-start"
        variant="ghost"
        onClick={() => void query.refetch()}
      >
        {t(($) => $.detail.section_load_failed_retry)}
      </Button>
    );
  if (!data)
    return (
      <p className="p-4 text-muted-foreground">
        {t(($) => $.table.loading_branch)}
      </p>
    );
  if (!graph)
    return (
      <p className="p-4 text-muted-foreground">
        {t(($) => $.dependencies.empty)}
      </p>
    );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <p className="px-5 pt-3 text-caption text-muted-foreground">
        {t(($) => $.dependencies.direction)}
      </p>
      <div
        className="min-h-0 flex-1 overflow-auto"
        aria-label={t(($) => $.view.dependency)}
        role="region"
      >
        <div
          className="relative"
          style={{ width: graph.graph().width, height: graph.graph().height }}
        >
          <svg
            className="pointer-events-none absolute inset-0 text-muted-foreground"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={arrow}
                markerWidth="7"
                markerHeight="7"
                refX="7"
                refY="3.5"
                orient="auto"
              >
                <path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor" />
              </marker>
            </defs>
            {graph.edges().map((edge) => (
              <polyline
                key={edge.v + edge.w}
                points={graph
                  .edge(edge)
                  .points.map((p: { x: number; y: number }) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                markerEnd={`url(#${arrow})`}
              />
            ))}
          </svg>
          {data.nodes.map((node) => {
            const { x, y } = graph.node(node.id);
            const predecessors = graph.predecessors(node.id) ?? [];
            return (
              <button
                type="button"
                key={node.id}
                data-peek-target={node.id}
                onClick={() => peek?.open(node.id)}
                title={node.title}
                style={{
                  left: x - width / 2,
                  top: y - height / 2,
                  width,
                  height,
                }}
                className="absolute flex flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 text-left hover:border-brand focus-visible:outline-ring"
              >
                <span className="text-caption text-muted-foreground">
                  {node.identifier}
                </span>
                <span className="truncate text-label font-medium">
                  {node.title}
                </span>
                <span className="truncate text-caption text-muted-foreground">
                  {statuses.labelOf(node.status)}
                </span>
                {predecessors.length > 0 && (
                  <span className="sr-only">
                    {t(($) => $.dependencies.waits_for)}{" "}
                    {predecessors
                      .map((id) => graph.node(id).identifier)
                      .join(", ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
