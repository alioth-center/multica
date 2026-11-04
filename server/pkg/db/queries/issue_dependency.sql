-- name: ListProjectDependencyNodes :many
SELECT id, number, title, status FROM issue
WHERE workspace_id = sqlc.arg(workspace_id)::uuid AND project_id = sqlc.arg(project_id)::uuid
ORDER BY number;

-- name: ListProjectDependencyEdges :many
SELECT DISTINCT
    (CASE WHEN d.type = 'blocks' THEN i.id ELSE other.id END)::uuid AS prerequisite,
    (CASE WHEN d.type = 'blocks' THEN other.id ELSE i.id END)::uuid AS dependent
FROM issue i
JOIN issue_dependency d ON d.issue_id = i.id
JOIN issue other ON other.id = d.depends_on_issue_id
    AND other.workspace_id = i.workspace_id AND other.project_id = i.project_id
WHERE i.workspace_id = sqlc.arg(workspace_id)::uuid AND i.project_id = sqlc.arg(project_id)::uuid
    AND d.type IN ('blocks', 'blocked_by');

-- name: LockDependencyEndpoints :many
SELECT id FROM issue WHERE workspace_id = sqlc.arg(workspace_id)::uuid
    AND project_id = sqlc.arg(project_id)::uuid AND id = ANY(sqlc.arg(ids)::uuid[])
ORDER BY id FOR UPDATE;

-- name: AddIssueDependency :exec
INSERT INTO issue_dependency (issue_id, depends_on_issue_id, type)
VALUES (sqlc.arg(dependent)::uuid, sqlc.arg(prerequisite)::uuid, 'blocked_by');

-- name: RemoveIssueDependency :exec
DELETE FROM issue_dependency
WHERE (issue_id = sqlc.arg(dependent)::uuid AND depends_on_issue_id = sqlc.arg(prerequisite)::uuid AND type = 'blocked_by')
   OR (issue_id = sqlc.arg(prerequisite)::uuid AND depends_on_issue_id = sqlc.arg(dependent)::uuid AND type = 'blocks');
