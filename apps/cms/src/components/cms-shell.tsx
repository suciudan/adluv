import Link from "next/link";
import { FileText, FolderTree, PenSquare } from "lucide-react";

import Logo from "./logo";
import { SignOutButton } from "./sign-out-button";

export function CmsShell({
  currentPath,
  title,
  subtitle,
  headerAction,
  children,
}: {
  currentPath: "/posts" | "/authors" | "/categories";
  title: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items = [
    { href: "/posts", label: "Posts", icon: FileText },
    { href: "/authors", label: "Authors", icon: PenSquare },
    { href: "/categories", label: "Categories", icon: FolderTree },
  ] as const;

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-zinc-950 lg:flex lg:flex-col">
        <div className="flex-1 overflow-y-auto py-4">
          <div className="border-b border-white/10 px-4 pb-4">
            <div className="flex items-center gap-3">
              <Logo className="h-8 w-8" aria-hidden="true" />
              <div>
                <p className="text-2xl font-normal text-white" style={{ fontFamily: "Georgia, serif" }}>
                  Editor
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 pt-4">
            <p className="font-sans text-xs font-semibold uppercase tracking-widest text-zinc-500">Manage</p>
          </div>

          <nav className="space-y-0.5">
            {items.map((item) => {
              const active = item.href === currentPath;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-3 px-4 py-3 font-sans text-[13px] font-medium transition",
                    active
                      ? "border-l-4 border-violet-500 bg-zinc-800 pl-3 text-white"
                      : "border-l-4 border-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white",
                  ].join(" ")}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

        </div>

        <div className="border-t border-white/10 p-4">
          <div className="font-sans text-sm">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="min-w-0 bg-zinc-900">
        <header className="px-5 py-5">
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex items-center gap-3">
              <h1 className="font-sans text-3xl font-semibold text-zinc-100">{title}</h1>
              {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
            </div>
            {subtitle ? (
              <p className="mt-2 max-w-3xl font-sans text-sm leading-6 text-zinc-400">{subtitle}</p>
            ) : null}
          </div>
        </header>

        <main className="px-5 pb-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
