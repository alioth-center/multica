import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api";
import { issueKeys } from "./queries";
export type { DependencyGraph } from "../api/dependency-graph";

export function dependencyGraphOptions(wsId: string, projectId: string) {
  return queryOptions({
    queryKey: issueKeys.dependencyGraph(wsId, projectId),
    queryFn: () => api.projectDependencyGraph(projectId),
    enabled: !!wsId && !!projectId,
  });
}

export function useSetIssueDependency(
  wsId: string,
  projectId: string,
  issueId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      prerequisite,
      add,
    }: {
      prerequisite: string;
      add: boolean;
    }) => api.setIssueDependency(issueId, prerequisite, add),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: dependencyGraphOptions(wsId, projectId).queryKey,
      }),
  });
}
