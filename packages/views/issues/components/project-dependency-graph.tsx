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
    ranksep: 92,
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
  for (const id of graph.nodes()) {
    const y = graph.node(id).y;
    for (const incoming of [true, false]) {
      const edges = (incoming ? graph.inEdges(id) : graph.outEdges(id)) ?? [];
      const ports = edges.map((edge) => {
        const { points } = graph.edge(edge);
        const end = points.length - 1;
        const tip = points[incoming ? end : 0];
        const adjacentY = points.length === 3
          ? graph.node(incoming ? edge.v : edge.w).y
          : points[incoming ? end - 2 : 2].y;
        return { tip, adjacentY };
      });
      // Match the order of the adjacent lanes so the fan does not twist at the card.
      ports.sort((a, b) => a.adjacentY - b.adjacentY);
      const spacing = Math.min(14, (height - 24) / Math.max(1, ports.length - 1));
      ports.forEach(({ tip }, index) => {
        tip.y = y + (index - (ports.length - 1) / 2) * spacing;
      });
    }
  }
  return graph;
}

function dependencyPath(
  graph: ReturnType<typeof positionGraph>,
  edge: { v: string; w: string },
) {
  const source = graph.node(edge.v);
  const target = graph.node(edge.w);
  const points = graph.edge(edge).points;
  let x = source.x + width / 2;
  let y = points[0].y;
  let path = `M ${x} ${y}`;

  function curveTo(nextX: number, nextY: number) {
    const midX = (x + nextX) / 2;
    path += ` C ${midX} ${y}, ${midX} ${nextY}, ${nextX} ${nextY}`;
    x = nextX;
    y = nextY;
  }

  // Dagre alternates gap and rank waypoints. Cross each intervening card
  // column in its assigned lane and bend only in the gaps between columns.
  for (let i = 2; i < points.length - 1; i += 2) {
    const lane = points[i];
    curveTo(lane.x - width / 2, lane.y);
    x = lane.x + width / 2;
    path += ` H ${x}`;
  }
  const arrowX = target.x - width / 2 - 4;
  curveTo(arrowX - 8, points[points.length - 1].y);
  path += ` H ${arrowX}`;
  return path;
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
            className="pointer-events-none absolute inset-0 text-faint-foreground"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={arrow}
                markerUnits="userSpaceOnUse"
                markerWidth="9"
                markerHeight="10"
                refX="7"
                refY="5"
                orient="auto"
              >
                <path
                  d="m2 1.5 5 3.5-5 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </marker>
            </defs>
            {graph.edges().map((edge) => (
              <path
                key={edge.v + edge.w}
                d={dependencyPath(graph, edge)}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
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
