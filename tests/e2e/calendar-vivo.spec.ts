import { test, expect } from "@playwright/test";

import { loginComoAdmin, lerCreds } from "./helpers/login-admin";

let creds = lerCreds();

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  creds = await loginComoAdmin(page, creds);
});

test("cria categoria e agendamento, filtra agenda e encontra o histórico", async ({ page }) => {
  const suffix = Date.now();
  const category = `Avaliação E2E ${suffix}`;
  const eventTitle = `Consulta E2E ${suffix}`;

  await page.goto("/app/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(page.getByRole("button", { name: /novo agendamento/i })).toBeVisible();

  await page.getByRole("tab", { name: "Categorias" }).click();
  await page.locator("#type-name").fill(category);
  await page.locator("#type-duration").fill("45");
  await page.getByRole("button", { name: /criar categoria/i }).click();
  await expect(page.getByText(category)).toBeVisible();

  await page.getByRole("tab", { name: "Agenda" }).click();
  await page.getByRole("button", { name: /novo agendamento/i }).click();
  await page.locator("#calendar-title").fill(eventTitle);
  await page.locator("#calendar-type").selectOption({ label: `${category} · 45 min` });
  const member = page.locator("#calendar-member");
  if ((await member.locator("option").count()) > 1) await member.selectOption({ index: 1 });
  await page.getByRole("button", { name: /salvar agendamento/i }).click();
  await expect(page.getByText(eventTitle)).toBeVisible();

  await page.getByLabel("Filtrar por categoria").selectOption({ label: category });
  await expect(page.getByText(eventTitle)).toBeVisible();

  await page.getByRole("tab", { name: "Histórico" }).click();
  await expect(page.getByText(eventTitle)).toBeVisible();

  await page.getByRole("tab", { name: "Integrações" }).click();
  await expect(page.getByText("Google Calendar BYO")).toBeVisible();
  await expect(page.getByRole("button", { name: /conectar google|sincronizar/i }).first()).toBeVisible();
});
