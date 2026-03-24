'use client'
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Radio, Settings, LogOut, Film, Users, ArrowLeftCircle, ShieldCheck, FolderKanban } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useEffect } from 'react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Radio, label: 'Stream Control', href: '/dashboard/stream' },
  { icon: Film, label: 'File Manager', href: '/dashboard/videos' },
  { icon: Users, label: 'User Manage', href: '/dashboard/users', adminOnly: true },
  { icon: FolderKanban, label: 'Manage Files', href: '/dashboard/manage-files', adminOnly: true },
  { icon: Radio, label: 'Manage Streams', href: '/dashboard/manage-streams', adminOnly: true },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [switchingBack, setSwitchingBack] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setCurrentRole(data.userRole || 'admin');
        setIsImpersonating(!!data.isImpersonating);
      })
      .catch(() => { });
  }, []);

  const switchBackToAdmin = async () => {
    if (!confirm('Switch back to your admin account?')) return;
    setSwitchingBack(true);
    try {
      const res = await fetch('/api/auth/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: 'admin' }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = '/dashboard/users';
      }
    } catch (e) {
      setSwitchingBack(false);
    }
  };

  return (
    <div className="flex flex-col w-64 h-full bg-[#111] text-gray-300 border-r border-gray-800">
      <div className="flex items-center justify-center h-20 border-b border-gray-800 bg-[#161616]">
        <h1 className="text-xl font-bold text-white tracking-widest uppercase">
          <span className="text-red-500">V Magic</span> Digital
        </h1>
      </div>

      {/* Impersonation Warning Badge */}
      {isImpersonating && currentRole && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 border bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="truncate">Viewing as: {currentRole}</span>
        </div>
      )}

      {/* Admin Badge (Static) */}
      {!isImpersonating && currentRole === 'admin' && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 border bg-red-500/10 border-red-500/20 text-red-400">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="truncate">Admin Account</span>
        </div>
      )}

      <nav className="flex-1 py-4 space-y-2 px-4 mt-2">
        {navItems.map((item) => {
          if ((item as any).adminOnly && currentRole !== 'admin') return null;
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

      <div className="p-4 border-t border-gray-800 space-y-2">
        {/* Switch back to Admin button — only visible when impersonating */}
        {isImpersonating && (
          <button
            onClick={switchBackToAdmin}
            disabled={switchingBack}
            className="flex items-center space-x-3 px-4 py-3 w-full rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/20 transition-all font-semibold text-sm"
          >
            <ArrowLeftCircle className="w-5 h-5 shrink-0" />
            <span>{switchingBack ? 'Switching...' : 'Return to Admin'}</span>
          </button>
        )}
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
