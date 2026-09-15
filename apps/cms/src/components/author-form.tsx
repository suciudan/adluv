"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { BlogAuthor } from "@adluv/db";

import { saveBlogAuthorAction } from "../../app/actions/blog";
import { Button, buttonClassName } from "./button";
import { MediaField } from "./media-field";

type MutationResponse =
  | {
      status: "ok";
    }
  | {
      status: "error";
      message: string;
    };

export function AuthorForm({ author }: { author: BlogAuthor | null }) {
  const router = useRouter();
  const [name, setName] = useState(author?.name ?? "");
  const [slug, setSlug] = useState(author?.slug ?? "");
  const [role, setRole] = useState(author?.role ?? "");
  const [avatarLabel, setAvatarLabel] = useState(author?.avatarLabel ?? "");
  const [avatarImageUrl, setAvatarImageUrl] = useState(author?.avatarImageUrl ?? "");
  const [bio, setBio] = useState(author?.bio ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="font-sans text-sm font-semibold text-zinc-100">
            {author ? "Edit author" : "New author"}
          </p>
        </div>

        <div className="grid gap-5 p-5">
          <label className="grid min-w-0 gap-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-sm border border-white/10 bg-zinc-900 px-4 py-3 font-sans text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="w-full rounded-sm border border-white/10 bg-zinc-900 px-4 py-3 font-sans text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Public role</span>
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="w-full rounded-sm border border-white/10 bg-zinc-900 px-4 py-3 font-sans text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Bio</span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={6}
              className="w-full rounded-sm border border-white/10 bg-zinc-900 px-4 py-3 font-sans text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </label>

          {message ? (
            <p className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 font-sans text-sm text-red-200">
              {message}
            </p>
          ) : null}
        </div>
      </section>

      <aside className="space-y-6">
        <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="font-sans text-sm font-semibold text-zinc-100">Author avatar</p>
          </div>
          <div className="space-y-5 p-4">
            <label className="grid min-w-0 gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Avatar label</span>
              <input
                value={avatarLabel}
                onChange={(event) => setAvatarLabel(event.target.value)}
                maxLength={128}
                className="w-full rounded-sm border border-white/10 bg-zinc-900 px-4 py-3 font-sans text-sm text-zinc-100 outline-none focus:border-violet-500"
              />
              <p className="font-sans text-xs text-zinc-500">
                Up to 128 characters. Used when no avatar image is set.
              </p>
            </label>

            <MediaField
              label="Author avatar"
              collection="author-avatars"
              value={avatarImageUrl}
              onChange={setAvatarImageUrl}
              emptyLabel="Upload or select an avatar from the media library."
              showOpenButton={false}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="font-sans text-sm font-semibold text-zinc-100">Actions</p>
          </div>
          <div className="space-y-3 p-4">
            <Button
              type="button"
              fullWidth
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const payload = (await saveBlogAuthorAction({
                    authorId: author?.id,
                    slug,
                    name,
                    role,
                    avatarLabel,
                    avatarImageUrl,
                    bio,
                  })) as MutationResponse;

                  if (payload.status === "error") {
                    setMessage(payload.message);
                    return;
                  }

                  setMessage(null);
                  router.push("/authors");
                  router.refresh();
                });
              }}
            >
              {isPending ? "Saving..." : author ? "Save author" : "Create author"}
            </Button>

            <Link
              href="/authors"
              className={buttonClassName({ variant: "secondary", fullWidth: true })}
            >
              Back to authors
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
