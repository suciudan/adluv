import { expect, type Page, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { readTrackedCompanySnapshot, resetE2eState } from "./helpers/state";

type ScrapedAdvertiserSnapshot = NonNullable<Awaited<ReturnType<typeof readTrackedCompanySnapshot>>>;

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetE2eState();
});

async function addAdvertiserFromUrl(
  page: Page,
  options: {
    input: string;
    expectedName: string;
  },
) {
  const modal = await openAddAdvertiserModal(page);
  const searchInput = modal.getByPlaceholder("https://nike.com or ad library link");

  await searchInput.fill(options.input);
  await expect(searchInput).toBeEnabled({ timeout: 15_000 });

  const resultCard = modal.locator("article").filter({ hasText: options.expectedName }).first();

  await expect(resultCard).toBeVisible({ timeout: 15_000 });
  await resultCard.getByRole("button", { name: "Add advertiser" }).click();

  await expect(modal).toBeHidden({ timeout: 15_000 });
}

async function openAddAdvertiserModal(page: Page) {
  await page.goto("/advertisers");
  await page.getByRole("banner").getByRole("button", { name: "Add Advertiser" }).click();

  const modal = page.locator("[data-add-advertiser-modal-surface]").last();
  await expect(modal).toBeVisible();

  return modal;
}

async function waitForScrapedAdvertiser(sourceAdvertiserId: string) {
  await expect
    .poll(
      async () => {
        const snapshot = await readTrackedCompanySnapshot(sourceAdvertiserId, "linkedin");

        return snapshot?.status === "active" && snapshot.adsCount >= 1;
      },
      {
        timeout: 30_000,
      },
    )
    .toBe(true);

  const snapshot = await readTrackedCompanySnapshot(sourceAdvertiserId, "linkedin");
  expect(snapshot?.adsCount).toBeGreaterThanOrEqual(1);
  expect(snapshot?.advertiserId).toBeTruthy();

  return snapshot!;
}

async function waitForTrackedAdvertiser(sourceAdvertiserId: string) {
  await expect
    .poll(
      async () => {
        const snapshot = await readTrackedCompanySnapshot(sourceAdvertiserId, "linkedin");

        return Boolean(snapshot);
      },
      {
        timeout: 15_000,
      },
    )
    .toBe(true);

  const snapshot = await readTrackedCompanySnapshot(sourceAdvertiserId, "linkedin");
  expect(snapshot?.advertiserId).toBeTruthy();

  return snapshot!;
}

async function expectAdvertiserAndScrapedAdVisible(page: Page, snapshot: ScrapedAdvertiserSnapshot) {
  await page.goto(`/advertisers/${snapshot.advertiserId}/ads`);
  await page.waitForURL("**/ads");
  await expect(page.getByText("Fixture launch ad")).toBeVisible();
}

test("adds an advertiser from its advertiser URL after scraped ads render in the app", async ({ page }) => {
  await login(page);

  await addAdvertiserFromUrl(page, {
    input: "https://www.linkedin.com/company/e2e-url-only-advertiser/",
    expectedName: "E2e Url Only Advertiser",
  });

  const confirmation = page.getByText("E2e Url Only Advertiser added to watchlist");
  await expect(confirmation).toBeVisible();
  await expect(page.getByText(/started scanning/i)).toBeVisible();
  await expect(page.getByText(/Ads will appear in the watchlist as soon as the first scrape finishes/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "View watchlist" })).toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(confirmation).toBeVisible();

  const snapshot = await waitForScrapedAdvertiser("e2e-url-only-advertiser");
  await expectAdvertiserAndScrapedAdVisible(page, snapshot);
});

test("opens Add Advertiser as a viewport modal", async ({ page }) => {
  await login(page);

  await openAddAdvertiserModal(page);

  const overlay = page.locator("[data-add-advertiser-modal]").last();
  await expect(overlay).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add advertiser" })).toBeVisible();

  await expect
    .poll(async () =>
      overlay.evaluate((element) => {
        const rect = element.getBoundingClientRect();

        return {
          isBodyChild: element.parentElement === document.body,
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      }),
    )
    .toMatchObject({
      isBodyChild: true,
      left: 0,
      top: 0,
      width: await page.evaluate(() => window.innerWidth),
      height: await page.evaluate(() => window.innerHeight),
    });
});

test("keeps Add Advertiser recoverable when provider lookup is rate limited", async ({ page }) => {
  await login(page);

  const modal = await openAddAdvertiserModal(page);
  const searchInput = modal.getByPlaceholder("https://nike.com or ad library link");

  await searchInput.fill("https://e2e-rate-limit.test");

  await expect(
    modal.getByText("Advertiser search is temporarily unavailable. Provider lookup is retrying through proxies."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByText(/Rate limit exceeded/i)).toHaveCount(0);
  await expect(modal.getByText(/Searching\.\.\./i)).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Add advertiser" }).last()).toBeDisabled();
});

test("keeps the modal usable after an add failure and can add a valid advertiser afterward", async ({ page }) => {
  await login(page);

  const modal = await openAddAdvertiserModal(page);
  const searchInput = modal.getByPlaceholder("https://nike.com or ad library link");

  await searchInput.fill("https://www.linkedin.com/company/e2e-tracking-error/");

  const failingCard = modal.locator("article").filter({ hasText: "E2e Tracking Error" }).first();

  await expect(failingCard).toBeVisible({ timeout: 15_000 });
  await failingCard.getByRole("button", { name: "Add advertiser" }).click();
  await expect(modal.getByText("Fixture add advertiser failure.")).toBeVisible({ timeout: 15_000 });
  await expect(failingCard.getByRole("button", { name: "Add advertiser" })).toBeEnabled();
  await expect(failingCard.getByText("Adding...")).toHaveCount(0);

  await searchInput.fill("https://www.linkedin.com/company/e2e-recovered-advertiser/");

  const recoveredCard = modal.locator("article").filter({ hasText: "E2e Recovered Advertiser" }).first();

  await expect(recoveredCard).toBeVisible({ timeout: 15_000 });
  await recoveredCard.getByRole("button", { name: "Add advertiser" }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });

  await waitForTrackedAdvertiser("e2e-recovered-advertiser");
});

test("adds an advertiser from an ad library link", async ({ page }) => {
  await login(page);

  await addAdvertiserFromUrl(page, {
    input: "https://www.linkedin.com/ad-library/search?accountOwner=e2e-library-only-advertiser&countries=US",
    expectedName: "E2e Library Only Advertiser",
  });
  await waitForTrackedAdvertiser("e2e-library-only-advertiser");
});
