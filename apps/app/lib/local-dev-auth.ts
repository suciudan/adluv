export function getLocalDevCredentials(env: NodeJS.ProcessEnv = process.env) {
  const username = env.LOCAL_DEV_AUTH_USERNAME?.trim();
  const password = env.LOCAL_DEV_AUTH_PASSWORD?.trim();

  if (env.NODE_ENV !== "development" || !username || !password || password.length < 8) {
    return null;
  }

  return { username, password };
}

export function isLocalDevHost(value: string | null) {
  if (!value) {
    return false;
  }

  // This helper is restricted to loopback origins, even behind a dev proxy.
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(value);
}
