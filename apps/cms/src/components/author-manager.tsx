"use client";

import Link from "next/link";

import type { BlogAuthor } from "@adluv/db";

import { buttonClassName } from "./button";

export function AuthorManager({ authors }: { authors: BlogAuthor[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-950">
      {authors.length ? (
        <table className="min-w-full border-collapse text-left font-sans text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="border-b border-white/10 px-4 py-3 font-semibold">Name</th>
              <th className="border-b border-white/10 px-4 py-3 font-semibold">Slug</th>
              <th className="border-b border-white/10 px-4 py-3 font-semibold">Role</th>
              <th className="border-b border-white/10 px-4 py-3 font-semibold">Bio</th>
              <th className="border-b border-white/10 px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {authors.map((author) => (
              <tr key={author.id} className="align-top hover:bg-zinc-900/70">
                <td className="border-b border-white/10 px-4 py-4">
                  <p className="font-medium text-zinc-100">{author.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{author.avatarLabel}</p>
                </td>
                <td className="border-b border-white/10 px-4 py-4 text-zinc-300">{author.slug}</td>
                <td className="border-b border-white/10 px-4 py-4 text-zinc-300">{author.role}</td>
                <td className="border-b border-white/10 px-4 py-4 text-xs leading-6 text-zinc-400">
                  {author.bio}
                </td>
                <td className="border-b border-white/10 px-4 py-4 text-right">
                  <Link
                    href={`/authors/${author.id}`}
                    className={buttonClassName({ variant: "secondary", size: "sm" })}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="space-y-4 px-6 py-12">
          <p className="font-sans text-sm text-zinc-500">No authors yet.</p>
          <Link href="/authors/new" className={buttonClassName({ size: "sm" })}>
            Add author
          </Link>
        </div>
      )}
    </div>
  );
}
