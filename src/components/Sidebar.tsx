'use client'
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Radio, Settings, LogOut, Film } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Radio, label: 'Stream Control', href: '/dashboard/stream' },
  { icon: Film, label: 'File Manager', href: '/dashboard/videos' },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col w-64 h-full bg-[#111] text-gray-300 border-r border-gray-800">
      <div className="flex items-center justify-center h-20 border-b border-gray-800 bg-[#161616]">
        <h1 className="text-xl font-bold text-white tracking-widest uppercase">
          <span className="text-red-500">V Magic</span> Digital
        </h1>
      </div>
      <nav className="flex-1 py-6 space-y-2 px-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-red-500/10 text-red-500'
                  : 'hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={async () => {
            await fetch('/api/auth', { method: 'DELETE' });
            window.location.href = '/';
          }}
          className="flex items-center space-x-3 px-4 py-3 w-full rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
