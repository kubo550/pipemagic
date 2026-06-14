import Link from "next/link";

type NavKey = "assistant" | "about";

const NAV: Array<{ key: NavKey; label: string; href: string }> = [
  { key: "assistant", label: "Assistant", href: "/" },
  { key: "about", label: "About me", href: "/about" },
];

const SOON = ["Usage", "Billing"];

/** Authenticated app shell: left sidebar nav + main content area. */
export function AppShell({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-zinc-200 px-3 py-5 dark:border-zinc-800">
        <div className="px-3 pb-4">
          <span className="text-lg font-semibold tracking-tight">PipeMagic</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                active === item.key
                  ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {SOON.map((label) => (
            <span
              key={label}
              className="cursor-not-allowed rounded-lg px-3 py-2 text-sm text-zinc-300 dark:text-zinc-600"
              title="Coming soon"
            >
              {label}
            </span>
          ))}
        </nav>

        <div className="mt-auto px-3">
          <a
            href="/api/auth/logout"
            className="text-xs text-zinc-400 underline-offset-4 hover:text-zinc-600 hover:underline dark:hover:text-zinc-300"
          >
            Disconnect
          </a>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-8 md:px-10">
        {children}
      </main>
    </div>
  );
}
