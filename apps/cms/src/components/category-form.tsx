"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { BlogCategory } from "@adluv/db";

import { saveBlogCategoryAction } from "../../app/actions/blog";
import { Button, buttonClassName } from "./button";

type MutationResponse =
  | {
      status: "ok";
    }
  | {
      status: "error";
      message: string;
    };

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function CategoryForm({ category }: { category: BlogCategory | null }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(category?.slug));
  const [description, setDescription] = useState(category?.description ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (slugTouched) {
      return;
    }

    setSlug(slugify(name));
  }, [name, slugTouched]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
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
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              className="w-full rounded-sm border border-white/10 bg-zinc-900 px-4 py-3 font-sans text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
            <p className="font-sans text-sm font-semibold text-zinc-100">Actions</p>
          </div>
          <div className="space-y-3 p-4">
            <Button
              type="button"
              fullWidth
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const payload = (await saveBlogCategoryAction({
                    categoryId: category?.id,
                    slug,
                    name,
                    description,
                  })) as MutationResponse;

                  if (payload.status === "error") {
                    setMessage(payload.message);
                    return;
                  }

                  setMessage(null);
                  router.push("/categories");
                  router.refresh();
                });
              }}
            >
              {isPending ? "Saving..." : category ? "Save category" : "Create category"}
            </Button>

            <Link
              href="/categories"
              className={buttonClassName({ variant: "secondary", fullWidth: true })}
            >
              Back to categories
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
