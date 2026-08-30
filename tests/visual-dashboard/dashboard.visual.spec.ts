import path from "node:path";
import { expect, test } from "@playwright/test";

const evidence = path.resolve(".superpowers/evidence/dashboard-periodo.png");

test("dashboard explica e atualiza os cinco conceitos pelo período", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Painel Geral" })).toBeVisible();

  await expect(page.getByText("24 consultas")).toBeVisible();
  await expect(page.getByText("Funil padrão · 15 cards no período")).toBeVisible();
  await expect(page.getByText("Na janela de 24h e ainda não encerradas")).toBeVisible();

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Últimos 7 dias" }).click();

  await expect(page.getByText("8 consultas")).toBeVisible();
  await expect(page.getByText("Criados nos últimos 7 dias · Clique para detalhes")).toBeVisible();
  await expect(page.getByText("Funil padrão · 5 cards no período")).toBeVisible();
  await expect(page.getByText("Recebido nos últimos 7 dias · Clique para detalhes")).toBeVisible();
  await expect(page.getByText("R$ 3.750,00")).toBeVisible();

  await page.screenshot({ path: evidence, fullPage: true });
});
