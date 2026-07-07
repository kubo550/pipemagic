"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, FileText, Clock, User, Plug, BarChart3, CreditCard } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV = [
  { label: "Assistant", href: "/", icon: MessageSquare },
  { label: "Post-meeting", href: "/post-meeting", icon: FileText },
  { label: "History", href: "/history", icon: Clock },
  { label: "Connections", href: "/connections", icon: Plug },
  { label: "About me", href: "/about", icon: User },
];

const SOON = [
  { label: "Usage", icon: BarChart3 },
  { label: "Billing", icon: CreditCard },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1.5 text-lg font-semibold tracking-tight">
          PipeMagic
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={pathname === item.href}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {SOON.map((item) => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton disabled className="opacity-50" title="Coming soon">
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <a
          href="/api/auth/logout"
          className="px-3 py-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Disconnect
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
