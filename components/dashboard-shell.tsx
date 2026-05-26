"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Plug,
  Files,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/files", label: "Files", icon: Files },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export type Plan = "Pro" | "Inactive" | "Admin";

export interface DashboardShellUser {
  fullName: string;
  email: string;
  avatarUrl: string;
  plan: Plan;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function PlanBadge({ plan }: { plan: Plan }) {
  if (plan === "Admin") {
    return (
      <Badge className="bg-purple-600 text-white hover:bg-purple-600">
        Admin
      </Badge>
    );
  }
  return (
    <Badge variant={plan === "Pro" ? "default" : "secondary"}>{plan}</Badge>
  );
}

function getInitials(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function UserBlock({ user }: { user: DashboardShellUser }) {
  const initials = getInitials(user.fullName || user.email);
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Avatar className="h-9 w-9">
        {user.avatarUrl && (
          <AvatarImage src={user.avatarUrl} alt={user.fullName} />
        )}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">
          {user.fullName || "Account"}
        </div>
        <div className="truncate text-xs text-muted-foreground leading-tight">
          {user.email}
        </div>
      </div>
    </div>
  );
}

function SidebarBody({
  pathname,
  user,
  onNavigate,
}: {
  pathname: string;
  user: DashboardShellUser;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="text-lg font-semibold tracking-tight"
        >
          Automate
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Separator />
      <div className="p-3">
        <UserBlock user={user} />
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function MobileBottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background md:hidden">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  user,
  children,
}: {
  user: DashboardShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r bg-background md:flex md:flex-col">
        <SidebarBody pathname={pathname} user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background px-4 md:px-6">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarBody
                pathname={pathname}
                user={user}
                onNavigate={() => setDrawerOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="text-base font-semibold md:hidden">Automate</div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="flex items-center justify-end gap-2 text-sm font-medium leading-tight">
                <span className="truncate">{user.fullName || "Account"}</span>
                <PlanBadge plan={user.plan} />
              </div>
              <div className="truncate text-xs text-muted-foreground leading-tight">
                {user.email}
              </div>
            </div>
            <div className="sm:hidden">
              <PlanBadge plan={user.plan} />
            </div>
            <Avatar className="h-9 w-9">
              {user.avatarUrl && (
                <AvatarImage src={user.avatarUrl} alt={user.fullName} />
              )}
              <AvatarFallback>
                {getInitials(user.fullName || user.email)}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
