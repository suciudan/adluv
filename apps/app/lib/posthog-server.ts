import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient() {
  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();

  if (!projectToken) {
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(projectToken, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
