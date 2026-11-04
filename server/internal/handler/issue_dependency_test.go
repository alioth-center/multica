package handler

import (
	"net/http"
	"testing"

	"github.com/multica-ai/multica/server/internal/testutil"
)

func TestProjectIssueDependencies(t *testing.T) {
	project := dbfx.Project(t, "Dependencies")
	cols := testutil.Cols{"project_id": project}
	a := dbfx.Issue(t, "Prepare", cols)
	b := dbfx.Issue(t, "Build", cols)
	c := dbfx.Issue(t, "Verify", cols)
	other := dbfx.Issue(t, "Outside project")
	set := func(method, dependent, prerequisite string, status int) {
		t.Helper()
		req := withURLParams(newRequest(method, "/?workspace_id="+testWorkspaceID, nil), "id", dependent, "prerequisite", prerequisite)
		testutil.Call(t, testHandler.SetIssueDependency, req).Want(status)
	}
	type edge struct {
		Prerequisite string
		Dependent    string
	}
	graph := func() []edge {
		t.Helper()
		var result struct {
			Nodes []dependencyNode
			Edges []edge
		}
		req := withURLParam(newRequest("GET", "/?workspace_id="+testWorkspaceID, nil), "id", project)
		testutil.Call(t, testHandler.ProjectDependencyGraph, req).Want(http.StatusOK).JSON(&result)
		if len(result.Nodes) != 3 {
			t.Fatalf("nodes = %v", result.Nodes)
		}
		return result.Edges
	}
	set("PUT", b, a, 204)
	set("PUT", b, a, 204)
	if edges := graph(); len(edges) != 1 || edges[0] != (edge{a, b}) {
		t.Fatalf("edges = %v", edges)
	}
	set("PUT", c, b, 204)
	set("PUT", a, c, 409)
	set("PUT", a, a, 400)
	set("PUT", b, other, 404)
	set("DELETE", b, a, 204)
	set("DELETE", b, a, 204)
	if edges := graph(); len(edges) != 1 || edges[0] != (edge{b, c}) {
		t.Fatalf("remaining edges = %v", edges)
	}
}
