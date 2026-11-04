"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorCode } from "@multica/core/api";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  dependencyGraphOptions,
  useSetIssueDependency,
} from "@multica/core/issues/dependencies";
import { Button } from "@multica/ui/components/ui/button";
import { Plus, X } from "@multica/ui/icons";
import { useT } from "../../i18n";
import {
  PickerEmpty,
  PickerItem,
  PropertyPicker,
} from "./pickers/property-picker";

export function IssueDependencies({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const { t } = useT("issues");
  const wsId = useWorkspaceId();
  const query = useQuery(dependencyGraphOptions(wsId, projectId));
  const change = useSetIssueDependency(wsId, projectId, issueId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const graph = query.data;
  const required = new Set(
    graph?.edges
      .filter((edge) => edge.dependent === issueId)
      .map((edge) => edge.prerequisite),
  );
  const prerequisites =
    graph?.nodes.filter((node) => required.has(node.id)) ?? [];
  const term = search.trim().toLowerCase();
  const choices = open
    ? (graph?.nodes.filter(
        (node) =>
          node.id !== issueId &&
          !required.has(node.id) &&
          `${node.identifier} ${node.title}`.toLowerCase().includes(term),
      ) ?? [])
    : [];

  return (
    <section className="mt-6 space-y-1">
      <div className="flex items-center gap-2">
        <h2 className="text-label font-medium">
          {t(($) => $.dependencies.waits_for)}
        </h2>
        {graph && (
          <PropertyPicker
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              setSearch("");
            }}
            searchable
            align="start"
            width="w-80"
            searchPlaceholder={t(($) => $.dependencies.search)}
            onSearchChange={setSearch}
            triggerRender={
              <Button variant="ghost" size="xs" disabled={change.isPending} />
            }
            trigger={
              <>
                <Plus />
                {t(($) => $.dependencies.add)}
              </>
            }
          >
            {choices.slice(0, 100).map((node) => (
              <PickerItem
                key={node.id}
                selected={false}
                disabled={change.isPending}
                onClick={() =>
                  change.mutate(
                    { prerequisite: node.id, add: true },
                    { onSuccess: () => setOpen(false) },
                  )
                }
              >
                <span className="truncate">
                  {node.identifier} · {node.title}
                </span>
              </PickerItem>
            ))}
            {!choices.length && <PickerEmpty />}
          </PropertyPicker>
        )}
      </div>
      {query.isLoading && (
        <p className="text-caption">{t(($) => $.table.loading_branch)}</p>
      )}
      {query.isError && (
        <Button size="xs" variant="ghost" onClick={() => void query.refetch()}>
          {t(($) => $.detail.section_load_failed_retry)}
        </Button>
      )}
      {prerequisites.map((node) => (
        <div key={node.id} className="flex items-center gap-2 text-body">
          <span className="min-w-0 truncate" title={node.title}>
            {node.identifier} · {node.title}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={change.isPending}
            aria-label={t(($) => $.dependencies.remove, {
              identifier: node.identifier,
            })}
            onClick={() => change.mutate({ prerequisite: node.id, add: false })}
          >
            <X />
          </Button>
        </div>
      ))}
      {change.isError && (
        <p role="alert" className="text-caption text-destructive">
          {errorCode(change.error) === "dependency_cycle"
            ? t(($) => $.dependencies.cycle)
            : t(($) => $.dependencies.save_failed)}
        </p>
      )}
    </section>
  );
}
