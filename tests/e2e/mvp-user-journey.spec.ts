import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import {
  readAlertSnapshot,
  readTrackedCompanySnapshot,
  resetE2eState,
} from "./helpers/state";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetE2eState();
});

async function trackCompany(
  page: Parameters<typeof login>[0],
  options: {
    query: string;
    expectedName: string;
  },
) {
  await page.goto("/advertisers");
  await page.getByRole("banner").getByRole("button", { name: "Add Advertiser" }).click();
  const modal = page.locator(".app-modal-surface").last();
  const searchInput = modal.getByPlaceholder("https://nike.com or ad library link");

  await searchInput.fill(options.query);
  await expect(searchInput).toBeEnabled({ timeout: 15_000 });
  const resultCards = modal
    .locator("article")
    .filter({
      has: page.getByRole("link", { name: options.expectedName, exact: true }),
    });

  const resultCard = resultCards.first();

  await expect(resultCard).toBeVisible({ timeout: 15_000 });
  await resultCard.getByRole("button", { name: "Add advertiser" }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
}

test("signs in, tracks a company, and renders persisted watchlist data", async ({ page }) => {
  await login(page);
  await trackCompany(page, {
    query: "https://www.linkedin.com/company/microsoft/",
    expectedName: "Microsoft",
  });

  await expect.poll(async () => {
    const snapshot = await readTrackedCompanySnapshot("microsoft", "linkedin");
    return snapshot?.status ?? null;
  }).toBe("active");

  const trackedCompany = await readTrackedCompanySnapshot("microsoft", "linkedin");
  expect(trackedCompany?.adsCount).toBeGreaterThanOrEqual(1);

  expect(trackedCompany?.advertiserId).toBeTruthy();
  await page.goto(`/advertisers/${trackedCompany!.advertiserId}/ads`);
  await page.waitForURL("**/ads");
  await expect(page.getByText("Fixture launch ad")).toBeVisible();

  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await expect(page.getByText(/Microsoft/).first()).toBeVisible();
});

test("creates alert rows and delivery records after scheduled sync", async ({ page }) => {
  await login(page);
  await trackCompany(page, {
    query: "https://www.linkedin.com/company/google/",
    expectedName: "Google",
  });

  await expect.poll(async () => {
    const snapshot = await readTrackedCompanySnapshot("google", "linkedin");
    return snapshot?.status ?? null;
  }).toBe("active");

  await expect.poll(async () => {
    const snapshot = await readAlertSnapshot("google", "linkedin");
    return snapshot?.channels.slice().sort().join(",") ?? "";
  }, {
    timeout: 20_000,
  }).toBe("email,in_app");

  await page.goto("/activity");
  await expect(page.getByText(/Google/).first()).toBeVisible();
});

test("tracks a domain URL and renders it on the watchlist", async ({ page }) => {
  await login(page);

  await trackCompany(page, {
    query: "netflix.com",
    expectedName: "Netflix",
  });

  await expect.poll(async () => {
    const snapshot = await readTrackedCompanySnapshot("netflix", "linkedin");
    return snapshot?.status === "active" && snapshot.adsCount >= 1;
  }).toBe(true);

  await page.goto("/watchlist");

  await expect(page.getByText("Netflix")).toBeVisible();
  await expect(page.getByText("LinkedIn")).toBeVisible();
});
