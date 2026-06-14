import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

/** Authenticated app shell: shadcn sidebar + main content area. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">PipeMagic</span>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-8 md:px-10">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
