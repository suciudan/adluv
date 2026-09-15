"use client";

import React from "react";

type CreativeAssetMediaProps = {
  alt: string;
  className: string;
  controls?: boolean;
  hint?: string | null;
  kind?: "image" | "video";
  onMediaError?: () => void;
  onMediaLoad?: (dimensions?: {
    width: number;
    height: number;
    aspectRatio: number;
  }) => void;
  poster?: string | null;
  src: string;
};

function isImageCreativeAsset(src: string) {
  const haystack = src.toLowerCase();

  return (
    haystack.includes(".jpg") ||
    haystack.includes(".jpeg") ||
    haystack.includes(".png") ||
    haystack.includes(".webp") ||
    haystack.includes(".gif") ||
    haystack.includes(".avif") ||
    haystack.startsWith("data:image/")
  );
}

export function isVideoCreativeAsset(src: string, hint?: string | null) {
  const haystack = src.toLowerCase();

  if (isImageCreativeAsset(src)) {
    return false;
  }

  return (
    haystack.includes("video") ||
    haystack.includes(".mp4") ||
    haystack.includes(".mov") ||
    haystack.includes(".webm") ||
    (!src.includes(".") && (hint ?? "").toLowerCase().includes("video"))
  );
}

function extractYoutubeVideoId(src: string) {
  try {
    const url = new URL(src);
    const hostname = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (hostname !== "youtube.com" && hostname !== "youtube-nocookie.com") {
      return null;
    }

    if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/").filter(Boolean)[1] ?? null;
    }

    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

export function getYoutubeEmbedSrc(src: string, controls = true) {
  const videoId = extractYoutubeVideoId(src);

  if (!videoId || !/^[a-z0-9_-]{6,}$/i.test(videoId)) {
    return null;
  }

  const url = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`);

  url.searchParams.set("rel", "0");
  url.searchParams.set("modestbranding", "1");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("controls", controls ? "1" : "0");

  return url.toString();
}

export function isYoutubeCreativeAsset(src: string) {
  return Boolean(getYoutubeEmbedSrc(src));
}

export function CreativeAssetMedia({
  alt,
  className,
  controls = false,
  hint,
  kind,
  onMediaError,
  onMediaLoad,
  poster,
  src,
}: CreativeAssetMediaProps) {
  const reportMediaLoad = (width: number, height: number) => {
    onMediaLoad?.({
      width,
      height,
      aspectRatio: width / height,
    });
  };
  const youtubeEmbedSrc = getYoutubeEmbedSrc(src, controls);

  if (youtubeEmbedSrc) {
    return (
      <iframe
        src={youtubeEmbedSrc}
        title={alt}
        className={className}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={controls ? undefined : { pointerEvents: "none" }}
        onLoad={() => onMediaLoad?.()}
      />
    );
  }

  if (kind === "video" || isVideoCreativeAsset(src, hint)) {
    return (
      <video
        src={src}
        poster={poster ?? undefined}
        className={className}
        controls={controls}
        autoPlay={!controls}
        loop={!controls}
        muted={!controls}
        playsInline
        preload={controls ? "metadata" : "none"}
        onLoadedMetadata={(event) => {
          reportMediaLoad(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
        }}
        onError={onMediaError}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Stored ad creatives can be arbitrary remote media URLs.
    <img
      src={src}
      alt={alt}
      className={className}
      onLoad={(event) => {
        reportMediaLoad(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
      }}
      onError={onMediaError}
    />
  );
}
