import { fetchLandingPageSnapshot } from "@adluv/source-adapters";
import { persistLandingPageSnapshot } from "@adluv/db";
import { captureLandingPageScreenshot } from "../landing-page-screenshots";
import { logWorkerEvent, toErrorContext } from "../logger";

export type LandingPageCapturePayload = {
  adId: string;
  url: string;
};

export async function runLandingPageCaptureJob(payload: LandingPageCapturePayload) {
  try {
    logWorkerEvent("info", "landing_page_capture.started", payload);

    const snapshot = await fetchLandingPageSnapshot(payload.url);
    const screenshotUrl = await captureLandingPageScreenshot(snapshot.url).catch((error) => {
      logWorkerEvent("warn", "landing_page_capture.screenshot_failed", {
        adId: payload.adId,
        url: snapshot.url,
        ...toErrorContext(error),
      });

      return undefined;
    });
    const result = await persistLandingPageSnapshot({
      adId: payload.adId,
      url: snapshot.url,
      title: snapshot.title,
      html: snapshot.html,
      screenshotUrl: screenshotUrl ?? snapshot.screenshotUrl,
      capturedAt: snapshot.capturedAt,
    });

    logWorkerEvent("info", "landing_page_capture.completed", {
      adId: payload.adId,
      url: payload.url,
      snapshotId: result.id,
      capturedAt: snapshot.capturedAt.toISOString(),
    });

    return {
      payload,
      snapshotId: result.id,
      snapshotStored: true,
      mode: "live",
    };
  } catch (error) {
    logWorkerEvent("error", "landing_page_capture.failed", {
      adId: payload.adId,
      url: payload.url,
      ...toErrorContext(error),
    });
    throw error;
  }
}
