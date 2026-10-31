'use client'
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Radio, Settings, LogOut, Film, Users, ArrowLeftCircle, ShieldCheck, FolderKanban, Zap, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Radio, label: 'Stream Control', href: '/dashboard/stream' },
  { icon: Zap, label: 'Auto Streamer', href: '/dashboard/auto-stream' },
  { icon: Film, label: 'File Manager', href: '/dashboard/videos' },
  { icon: Users, label: 'User Manage', href: '/dashboard/users', adminOnly: true },
  { icon: FolderKanban, label: 'Manage Files', href: '/dashboard/manage-files', adminOnly: true },
  { icon: Radio, label: 'Manage Streams', href: '/dashboard/manage-streams', adminOnly: true },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
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

  const renderSidebarContent = (isMobile: boolean = false) => (
    <div className="flex flex-col h-full bg-[#111] text-gray-300">
      <div className="flex items-center justify-between px-6 h-16 sm:h-20 border-b border-gray-800 bg-[#161616]">
        <h1 className="text-lg sm:text-xl font-bold text-white tracking-widest uppercase">
          <span className="text-red-500">V Magic</span> Digital
        </h1>
        {isMobile && (
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
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

      <nav className="flex-1 py-4 space-y-1.5 px-3 mt-1 overflow-y-auto">
        {navItems.map((item) => {
          if ((item as any).adminOnly && currentRole !== 'admin') return null;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (isMobile && onClose) onClose();
              }}
              className={cn(
                'flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-sm font-medium',
                isActive
                  ? 'bg-red-500/15 text-red-400 font-semibold border border-red-500/20 shadow-sm'
                  : 'hover:bg-gray-800/60 hover:text-white text-gray-400'
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800 space-y-2 mt-auto">
        {/* Switch back to Admin button — only visible when impersonating */}
        {isImpersonating && (
          <button
            onClick={switchBackToAdmin}
            disabled={switchingBack}
            className="flex items-center space-x-3 px-4 py-2.5 w-full rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/20 transition-all font-semibold text-sm"
          >
            <ArrowLeftCircle className="w-5 h-5 shrink-0" />
            <span className="truncate">{switchingBack ? 'Switching...' : 'Return to Admin'}</span>
          </button>
        )}
        <button
          onClick={async () => {
            await fetch('/api/auth', { method: 'DELETE' });
            window.location.href = '/';
          }}
          className="flex items-center space-x-3 px-4 py-2.5 w-full rounded-xl hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors text-sm font-medium"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-full bg-[#111] text-gray-300 border-r border-gray-800 shrink-0">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Slide-out Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl border-r border-gray-800"
            >
              {renderSidebarContent(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
