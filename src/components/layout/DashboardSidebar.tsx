"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users,
  Send,
  Kanban,
  Settings,
  Search,
  Bot,
  Linkedin,
  Sparkles,
  Inbox,
  BarChart3,
  Zap,
} from "lucide-react";

const navItems = [
  { href: "/search", label: "AI Search", icon: Sparkles },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/scraper", label: "Scraper", icon: Bot },
  { href: "/campaigns", label: "Campaigns", icon: Linkedin },
  { href: "/outreach", label: "Outreach", icon: Send },
  { href: "/signals", label: "Signals", icon: Zap },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[220px] flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Search className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Scraped
        </span>
      </div>

      <nav className="flex-1 px-3 pt-2">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 transition-colors duration-150",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="text-[11px] text-muted-foreground">AxiomFlow</p>
      </div>
    </aside>
  );
}
