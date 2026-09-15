"use server";

import { revalidatePath } from "next/cache";

import { postDiscordErrorNotification } from "@adluv/config/discord-errors";
import { isE2eFixtureMode, resolveAdvertiserSummary, type SourceName } from "@adluv/source-adapters";
import {
  addAdvertiserEntityToWatchlist,
  ensureUserEntitlements,
  ensureUserNotificationSettings,
  recordJobQueued,
  updateAdvertiserSummary,
  upsertAdvertiser,
} from "@adluv/db";

import { getInitialIndexQueue } from "../../lib/queues";
import { getCurrentWorkspaceContext } from "../../lib/workspace";

function buildSafeJobId(...parts: Array<string | number>) {
  return parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("__")
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export async function addAdvertiserToWatchlistByIdAction(input: {
  id: string;
  canonicalName: string;
  source?: SourceName;
  sourceAdvertiserId?: string;
  profileUrl?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  summary?: string | null;
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    await ensureUserEntitlements(user.id);
    await ensureUserNotificationSettings(user.id);

    const summary = isE2eFixtureMode()
      ? input.summary ?? undefined
      : await resolveAdvertiserSummary({
          websiteUrl: input.websiteUrl,
          currentSummary: input.summary,
        }) ?? undefined;

    let targetAdvertiserId = input.id;

    if (input.source && input.sourceAdvertiserId) {
      targetAdvertiserId = (
        await upsertAdvertiser({
          id: input.id,
          source: input.source,
          sourceAdvertiserId: input.sourceAdvertiserId,
          canonicalName: input.canonicalName,
          profileUrl: input.profileUrl ?? undefined,
          websiteUrl: input.websiteUrl ?? undefined,
          industry: input.industry ?? undefined,
          companySize: input.companySize ?? undefined,
          country: input.country ?? undefined,
          summary,
        })
      ).id;
    } else if (summary) {
      await updateAdvertiserSummary(input.id, summary);
    }

    const trackedAdvertiser = await addAdvertiserEntityToWatchlist(user.id, targetAdvertiserId, workspace.id);

    if (!trackedAdvertiser) {
      return {
        status: "error" as const,
        message: "Advertiser was not found.",
      };
    }

    for (const trackedCompanyId of trackedAdvertiser.createdTrackedCompanyIds) {
      const job = await getInitialIndexQueue().add(
        "initial-index",
        {
          trackedCompanyId,
        },
        {
          jobId: buildSafeJobId("initial-index", trackedCompanyId),
        },
      );

      await recordJobQueued({
        id: String(job.id),
        queueName: job.queueName,
        payload: job.data,
      });
    }

    revalidatePath("/advertisers");
    revalidatePath("/activity");
    revalidatePath("/watchlist");
    revalidatePath(`/advertisers/${input.id}`);

    return {
      status: trackedAdvertiser.createdTrackedCompanyIds.length ? ("queued" as const) : ("existing" as const),
      trackedCompanyId: trackedAdvertiser.trackedCompanies[0]?.id ?? null,
      trackedCompanyIds: trackedAdvertiser.trackedCompanies.map((trackedCompany) => trackedCompany.id),
    };
  } catch (error) {
    await postDiscordErrorNotification({
      service: "adluv-app",
      event: "advertiser_add.watchlist_by_id_failed",
      title: "Add advertiser to watchlist failed",
      error,
      context: {
        input,
        userId: user.id,
        workspaceId: workspace.id,
      },
    });
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to add advertiser to watchlist.",
    };
  }
}
