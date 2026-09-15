import type { Page } from "@playwright/test";

import { getE2eAuthAccount } from "./state";

type AuthAccount = {
  username: string;
  password: string;
};

export async function login(page: Page) {
  await loginAs(page, getE2eAuthAccount());
}

export async function loginAs(page: Page, account: AuthAccount) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/activity");
}
