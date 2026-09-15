export const adminEmail = "admin@adluv.local";

export function isAdminUser(user: { email: string }) {
  return user.email.trim().toLowerCase() === adminEmail;
}
