"use client";

import Link from "next/link";

import type { BlogCategory } from "@adluv/db";

import { buttonClassName } from "./button";

export function CategoryManager({ categories }: { categories: BlogCategory[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-950">
      {categories.length ? (
        <table className="min-w-full border-collapse text-left font-sans text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="border-b border-white/10 px-4 py-3 font-semibold">Name</th>
              <th className="border-b border-white/10 px-4 py-3 font-semibold">Slug</th>
              <th className="border-b border-white/10 px-4 py-3 font-semibold">Description</th>
              <th className="border-b border-white/10 px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="align-top hover:bg-zinc-900/70">
                <td className="border-b border-white/10 px-4 py-4 font-medium text-zinc-100">
                  {category.name}
                </td>
                <td className="border-b border-white/10 px-4 py-4 text-zinc-300">{category.slug}</td>
                <td className="border-b border-white/10 px-4 py-4 text-xs leading-6 text-zinc-400">
                  {category.description}
                </td>
                <td className="border-b border-white/10 px-4 py-4 text-right">
                  <Link
                    href={`/categories/${category.id}`}
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
        <div className="px-6 py-12 font-sans text-sm text-zinc-500">No categories yet.</div>
      )}
    </div>
  );
}
