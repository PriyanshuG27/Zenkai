import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { House, Activity, Sparkles, Trophy, User, LogOut, Flame, Newspaper } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const DesktopSidebar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const navGroups = [
    {
      label: 'Core',
      items: [
        { path: '/home',       label: 'Dashboard',       Icon: House  },
        { path: '/challenges', label: 'Squads & Arena',  Icon: Trophy },
        { path: '/profile',    label: 'Profile & Settings', Icon: User },
      ],
    },
    {
      label: 'Tools',
      items: [
        { path: '/recap',           label: 'Recap Cinema',     Icon: Activity },
        { path: '/aura-forecaster', label: 'Aura & Beast Mode', Icon: Flame   },
      ],
    },
    {
      label: 'Explore',
      items: [
        { path: '/poster',   label: 'Poster Studio',   Icon: Sparkles  },
        { path: '/magazine', label: 'Sunday Magazine', Icon: Newspaper },
      ],
    },
  ];

  return (
    <aside
      style={{ height: '100dvh' }}
      className="w-64 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col justify-between sticky top-0 shrink-0 z-50 font-sans"
    >
      <div className="flex flex-col overflow-y-auto">
        {/* Logo Header */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-[var(--border)] shrink-0">
          <div className="w-8 h-8 rounded bg-black border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0">
            <img src="/logos/zenkai_official_logo.webp" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" width="32" height="32" fetchpriority="high" />
          </div>
          <span className="font-display text-2xl font-bold tracking-wider text-[var(--primary)]">
            ZENKAI
          </span>
        </div>

        {/* Grouped Navigation */}
        <nav className="p-4 flex flex-col gap-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              {/* Section label */}
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-50 px-4 mb-1">
                {group.label}
              </p>

              <div className="space-y-0.5">
                {group.items.map(({ path, label, Icon }) => {
                  const isActive = location.pathname === path || location.pathname.startsWith(`${path}/`);
                  return (
                    <Link
                      key={path}
                      to={path}
                      className={`flex items-center gap-3 px-4 h-11 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-[var(--bg-elevated)] border-l-4 border-[var(--primary)] text-[var(--primary)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Logout Bottom Section */}
      <div className="p-4 border-t border-[var(--border)] shrink-0">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 h-11 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--destructive)] w-full transition-all"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
