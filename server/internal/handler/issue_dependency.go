package handler

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

type dependencyNode struct {
	ID         string `json:"id"`
	Identifier string `json:"identifier"`
	Title      string `json:"title"`
	Status     string `json:"status"`
}

func (h *Handler) ProjectDependencyGraph(w http.ResponseWriter, r *http.Request) {
	project, ok := h.loadProjectForResource(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	ctx := r.Context()
	rows, err := h.Queries.ListProjectDependencyNodes(ctx, db.ListProjectDependencyNodesParams{WorkspaceID: project.WorkspaceID, ProjectID: project.ID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load project issues")
		return
	}
	edges, err := h.Queries.ListProjectDependencyEdges(ctx, db.ListProjectDependencyEdgesParams{WorkspaceID: project.WorkspaceID, ProjectID: project.ID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load dependencies")
		return
	}
	prefix := h.getIssuePrefix(ctx, project.WorkspaceID)
	nodes := make([]dependencyNode, len(rows))
	for i, row := range rows {
		nodes[i] = dependencyNode{ID: uuidToString(row.ID), Identifier: fmt.Sprintf("%s-%d", prefix, row.Number), Title: row.Title, Status: row.Status}
	}
	writeJSON(w, http.StatusOK, map[string]any{"nodes": nodes, "edges": edges})
}

func (h *Handler) SetIssueDependency(w http.ResponseWriter, r *http.Request) {
	issue, ok := h.loadIssueForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	prerequisite, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "prerequisite"), "prerequisite")
	if !ok {
		return
	}
	if !issue.ProjectID.Valid || issue.ID == prerequisite {
		writeError(w, http.StatusBadRequest, "choose another issue in the same project")
		return
	}

	ctx := r.Context()
	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to change dependency")
		return
	}
	defer tx.Rollback(ctx)
	q := h.Queries.WithTx(tx)
	// Serialize edits to this graph so simultaneous additions cannot form a cycle.
	_, err = q.LockProjectForWorkflowChange(ctx, db.LockProjectForWorkflowChangeParams{ID: issue.ProjectID, WorkspaceID: issue.WorkspaceID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lock project")
		return
	}
	ids, err := q.LockDependencyEndpoints(ctx, db.LockDependencyEndpointsParams{WorkspaceID: issue.WorkspaceID, ProjectID: issue.ProjectID, Ids: []pgtype.UUID{issue.ID, prerequisite}})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load issues")
		return
	}
	if len(ids) != 2 {
		writeError(w, http.StatusNotFound, "issue not found in project")
		return
	}
	if r.Method == http.MethodDelete {
		err = q.RemoveIssueDependency(ctx, db.RemoveIssueDependencyParams{Dependent: issue.ID, Prerequisite: prerequisite})
	} else {
		edges, readErr := q.ListProjectDependencyEdges(ctx, db.ListProjectDependencyEdgesParams{WorkspaceID: issue.WorkspaceID, ProjectID: issue.ProjectID})
		if readErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to load dependencies")
			return
		}
		for _, edge := range edges {
			if edge.Prerequisite == prerequisite && edge.Dependent == issue.ID {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		if dependencyReaches(edges, issue.ID, prerequisite) {
			writeErrorCode(w, http.StatusConflict, "dependency_cycle", "this dependency would form a cycle")
			return
		}
		err = q.AddIssueDependency(ctx, db.AddIssueDependencyParams{Dependent: issue.ID, Prerequisite: prerequisite})
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to change dependency")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save dependency")
		return
	}
	workspaceID := uuidToString(issue.WorkspaceID)
	actorType, actorID := h.resolveActor(r, requestUserID(r), workspaceID)
	h.publish(protocol.EventIssueDependenciesChanged, workspaceID, actorType, actorID, map[string]string{
		"project_id": uuidToString(issue.ProjectID),
	})
	w.WriteHeader(http.StatusNoContent)
}

func dependencyReaches(edges []db.ListProjectDependencyEdgesRow, start, end pgtype.UUID) bool {
	next := make(map[pgtype.UUID][]pgtype.UUID)
	for _, edge := range edges {
		next[edge.Prerequisite] = append(next[edge.Prerequisite], edge.Dependent)
	}
	seen := make(map[pgtype.UUID]bool)
	queue := []pgtype.UUID{start}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if id == end {
			return true
		}
		if !seen[id] {
			seen[id] = true
			queue = append(queue, next[id]...)
		}
	}
	return false
}
