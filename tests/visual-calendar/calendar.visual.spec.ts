import { expect, test } from "@playwright/test";

test("Calendar mantém a agenda compacta e o fluxo de criação navegável", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(page.getByText("Consulta de avaliação")).toBeVisible();

  await page.getByRole("button", { name: "Novo agendamento", exact: true }).click();
  await page.locator("#calendar-title").fill("Visita técnica");
  await page.getByRole("button", { name: /salvar agendamento/i }).click();
  await expect(page.getByText("Visita técnica")).toBeVisible();

  await page.getByRole("tab", { name: "Histórico" }).click();
  await expect(page.getByText("Visita técnica")).toBeVisible();
  await page.getByRole("tab", { name: "Integrações" }).click();
  await expect(page.getByText("Google Calendar BYO")).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar Google" })).toBeVisible();
});
