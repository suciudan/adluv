import { Radar } from "lucide-react";

const columns = [
  {
    title: "Product",
    links: ["Features", "Use Cases", "Pricing / Waitlist"],
  },
  {
    title: "Resources",
    links: ["Ad Examples", "Blog", "Changelog"],
  },
  {
    title: "Company",
    links: ["About", "Contact", "Affiliate / Partners"],
  },
  {
    title: "Legal",
    links: ["Privacy", "Terms", "Cookies"],
  },
];

export function Footer({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <footer className="border-t border-white/5 bg-[#08080c] py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600">
                <Radar size={14} className="text-white" />
              </div>
              <span className="text-white" style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif" }}>
                Adluv
              </span>
            </div>
            <p className="mt-4 max-w-xs text-zinc-500" style={{ fontSize: 13, lineHeight: 1.7 }}>
              The ad intelligence platform for marketers, agencies, and growth teams who want faster competitor research and better creative decisions.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h4 className="text-zinc-300" style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>
                {column.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-zinc-500 transition-colors hover:text-zinc-300" style={{ fontSize: 13 }}>
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-white/5 pt-6 text-center">
          <p className="text-zinc-600" style={{ fontSize: 12 }}>
            &copy; {new Date().getFullYear()} Adluv. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
