import { Sidebar } from '@/components/Sidebar';
import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Sidebar */}
      <Sidebar />
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Simple Top bar (optional, but requested layout said Sidebar) */}
        <header className="h-20 flex-shrink-0 flex items-center px-8 border-b border-gray-800 bg-[#111]">
          <h2 className="text-xl font-bold text-white tracking-widest">
            Control Dashboard
          </h2>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
