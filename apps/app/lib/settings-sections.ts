export const settingsSectionItems = [
  { id: "account", label: "Account" },
  { id: "notifications", label: "Notifications" },
  { id: "password", label: "Password" },
] as const;

export type SettingsSectionId = (typeof settingsSectionItems)[number]["id"];

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return settingsSectionItems.some((section) => section.id === value);
}
