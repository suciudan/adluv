"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";

import type { BlogAuthor, BlogCategory, BlogPostRecord } from "@adluv/db";
import { getSiteHref } from "@adluv/config";

import {
  deleteBlogPostAction,
  saveBlogPostAction,
  setBlogPostStatusAction,
} from "../../app/actions/blog";
import { Button } from "./button";
import { MdxEditor } from "./mdx-editor";
import { MediaField } from "./media-field";

type MutationResponse =
  | {
      status: "ok";
      postId?: string | null;
    }
  | {
      status: "error";
      message: string;
    };

function toLocalDateTimeValue(value: Date | null) {
  if (!value) {
    return "Not published";
  }

  return value.toLocaleString();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function PostEditorForm({
  post,
  authors,
  categories,
}: {
  post: BlogPostRecord | null;
  authors: BlogAuthor[];
  categories: BlogCategory[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post?.slug));
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(post?.coverImageUrl ?? "");
  const [authorId, setAuthorId] = useState(post?.author.id ?? "");
  const [categoryId, setCategoryId] = useState(post?.category.id ?? "");
  const [bodyMdx, setBodyMdx] = useState(post?.bodyMdx ?? "");
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? "");
  const [status, setStatus] = useState<"draft" | "published">(post?.status ?? "draft");
  const [message, setMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const estimatedReadTime = useMemo(() => {
    const words = bodyMdx.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 220));
  }, [bodyMdx]);

  useEffect(() => {
    if (slugTouched) {
      return;
    }

    setSlug(slugify(title));
  }, [title, slugTouched]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const submit = (nextStatus: "draft" | "published") => {
    startTransition(async () => {
      setMessage(null);
      setToastMessage(null);

      const payload = (await saveBlogPostAction({
        postId: post?.id,
        slug,
        title,
        excerpt,
        bodyMdx,
        coverImageUrl,
        seoTitle,
        seoDescription,
        authorId,
        categoryId,
        status: nextStatus,
      })) as MutationResponse;

      if (payload.status === "error") {
        setMessage(payload.message);
        return;
      }

      setStatus(nextStatus);
      setToastMessage(
        nextStatus === "draft"
          ? post ? "Draft saved." : "Draft created."
          : post ? "Published post updated." : "Post published.",
      );

      if (!post && payload.postId) {
        router.replace(`/posts/${payload.postId}`);
      } else {
        router.refresh();
      }
    });
  };

  const togglePublished = () => {
    if (!post) {
      submit(status === "published" ? "draft" : "published");
      return;
    }

    startTransition(async () => {
      setMessage(null);
      setToastMessage(null);
      const nextStatus = status === "published" ? "draft" : "published";
      const payload = (await setBlogPostStatusAction({
        postId: post.id,
        status: nextStatus,
      })) as MutationResponse;

      if (payload.status === "error") {
        setMessage(payload.message);
        return;
      }

      setStatus(nextStatus);
      setToastMessage(nextStatus === "published" ? "Post published." : "Moved to draft.");
      router.refresh();
    });
  };

  const destroy = () => {
    if (!post) {
      return;
    }

    const confirmed = window.confirm("Delete this post? This cannot be undone.");

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const payload = (await deleteBlogPostAction({ postId: post.id })) as MutationResponse;

      if (payload.status === "error") {
        setMessage(payload.message);
        return;
      }

      router.replace("/posts");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      {toastMessage ? (
        <div className="pointer-events-none fixed right-6 top-6 z-50">
          <div className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-sans text-sm font-medium text-emerald-100 shadow-2xl shadow-black/30 backdrop-blur">
            {toastMessage}
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        {message ? (
          <p className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 font-sans text-sm text-red-200">
            {message}
          </p>
        ) : null}

        <section className="rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
          <div className="grid gap-5 p-5">
            <label className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add title"
                className="rounded-sm border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-[26px] leading-tight text-zinc-100 outline-none transition focus:border-violet-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</span>
              <input
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="comparing-ad-intelligence-tools"
                className="rounded-sm border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-sm text-zinc-100 outline-none transition focus:border-violet-500"
              />
            </label>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4">
                <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Body (MDX)</span>
                <span className="font-sans text-xs text-zinc-500">Markdown + MDX components</span>
              </div>
              <MdxEditor
                value={bodyMdx}
                onChange={setBodyMdx}
              />
            </div>

            <label className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Excerpt</span>
              <textarea
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                rows={4}
                className="rounded-sm border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-sm leading-6 text-zinc-100 outline-none transition focus:border-violet-500"
              />
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="font-sans text-sm font-semibold text-zinc-100">SEO</p>
          </div>

          <div className="grid gap-5 p-5">
            <label className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">SEO title</span>
              <input
                value={seoTitle}
                onChange={(event) => setSeoTitle(event.target.value)}
                placeholder="Optional override"
                className="rounded-sm border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-sm text-zinc-100 outline-none transition focus:border-violet-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">SEO description</span>
              <textarea
                value={seoDescription}
                onChange={(event) => setSeoDescription(event.target.value)}
                rows={4}
                className="rounded-sm border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-sm text-zinc-100 outline-none transition focus:border-violet-500"
              />
            </label>
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="font-sans text-sm font-semibold text-zinc-100">Publish</p>
          </div>
          <div className="space-y-4 p-4 font-sans">
            <dl className="space-y-3 text-sm text-zinc-300">
              <div className="flex items-center justify-between gap-4">
                <dt>Status</dt>
                <dd className="rounded-sm bg-zinc-800 px-2 py-1 text-xs uppercase tracking-wide text-zinc-300">
                  {status}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Read time</dt>
                <dd>{estimatedReadTime} min</dd>
              </div>
              {post?.publishedAt ? (
                <div className="flex items-center justify-between gap-4">
                  <dt>Published</dt>
                  <dd className="text-right text-xs text-zinc-400">{toLocalDateTimeValue(post.publishedAt)}</dd>
                </div>
              ) : null}
            </dl>

            <div className="grid gap-2">
              {status !== "published" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => submit("draft")}
                  fullWidth
                >
                  {post ? "Save draft" : "Create draft"}
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={isPending}
                onClick={() => submit("published")}
                fullWidth
              >
                {status === "published" ? "Update post" : !post ? "Create and publish" : "Update and publish"}
              </Button>
              {post && status === "published" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={togglePublished}
                  fullWidth
                >
                  Move to draft
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="font-sans text-sm font-semibold text-zinc-100">Cover image</p>
          </div>
          <div className="p-4">
            <MediaField
              label=""
              collection="blog-media"
              value={coverImageUrl}
              onChange={setCoverImageUrl}
              emptyLabel="Upload or select a post cover image from the media library."
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="font-sans text-sm font-semibold text-zinc-100">Post settings</p>
          </div>
          <div className="grid gap-4 p-4 font-sans">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Author</span>
              <div className="relative">
                <select
                  value={authorId}
                  onChange={(event) => setAuthorId(event.target.value)}
                  className="w-full appearance-none rounded-sm border border-white/10 bg-zinc-900 px-3 py-2.5 pr-12 text-sm text-zinc-100 outline-none transition focus:border-violet-500"
                >
                  <option value="" disabled>
                    Select an author
                  </option>
                  {authors.map((author) => (
                    <option key={author.id} value={author.id}>
                      {author.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400"
                />
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Category</span>
              <div className="relative">
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="w-full appearance-none rounded-sm border border-white/10 bg-zinc-900 px-3 py-2.5 pr-12 text-sm text-zinc-100 outline-none transition focus:border-violet-500"
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400"
                />
              </div>
            </label>
          </div>
        </section>

      </aside>
    </div>
  );
}
