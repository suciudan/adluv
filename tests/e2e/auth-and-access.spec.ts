import { expect, test } from "@playwright/test";

import { resetE2eState } from "./helpers/state";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetE2eState();
});

test("rejects invalid credentials without leaving the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("unknown-user");
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});
