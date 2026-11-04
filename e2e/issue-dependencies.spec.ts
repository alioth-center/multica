import { test, expect } from "@playwright/test";
import { createTestApi, loginAsDefault } from "./helpers";

test("edit a prerequisite and open the dependent issue from the project graph", async ({
  page,
}) => {
  const api = await createTestApi();
  try {
    const project = await api.createProject("Dependency graph");
    const a = await api.createIssue("Define interface", {
      project_id: project.id,
    });
    const b = await api.createIssue("Build frontend", {
      project_id: project.id,
    });
    const slug = await loginAsDefault(page);

    await page.goto(`/${slug}/issues/${b.id}`);
    await page.getByRole("button", { name: "Add prerequisite" }).click();
    await page.getByPlaceholder("Search project issues").fill(a.identifier);
    await page
      .getByText(`${a.identifier} · ${a.title}`, { exact: true })
      .click();
    const remove = page.getByRole("button", {
      name: `Remove ${a.identifier} as a prerequisite`,
    });
    await expect(remove).toBeVisible();

    await page.goto(`/${slug}/projects/${project.id}`);
    await page.getByRole("button", { name: "Display", exact: true }).click();
    await page
      .getByTitle("Dependency graph", { exact: true })
      .click();
    const graph = page.getByRole("region", { name: "Dependency graph" });
    await expect(graph.locator("path[marker-end]")).toHaveCount(1);
    const dependent = graph.getByRole("button", { name: new RegExp(b.identifier) });
    await expect(dependent).toHaveAccessibleName(new RegExp(`Waits for ${a.identifier}`));
    await dependent.click();
    await remove.click();
    await expect(remove).toHaveCount(0);
    await expect(graph.locator("path[marker-end]")).toHaveCount(0);
    await expect(graph.getByRole("button")).toHaveCount(2);
  } finally {
    await api.cleanup();
  }
});
