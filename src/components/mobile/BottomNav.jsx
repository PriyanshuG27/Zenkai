import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { House, TrendingUp, Plus, Dumbbell, User } from 'lucide-react';

export const BottomNav = () => {
  const location = useLocation();

  const navItems = [
    { path: '/home', label: 'Home', Icon: House },
    { path: '/progress', label: 'Progress', Icon: TrendingUp },
    { path: '/workout', label: 'Workout', Icon: Plus, isWorkout: true },
    { path: '/challenges', label: 'Challenges', Icon: Dumbbell },
    { path: '/profile', label: 'Profile', Icon: User },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center border-t border-[var(--border)] bg-[var(--surface)]"
      style={{
        height: 'calc(64px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        const { path, label, Icon, isWorkout } = item;

        if (isWorkout) {
          return (
            <Link
              key={path}
              to={path}
              className="relative flex flex-col items-center justify-end h-full pb-1 text-[10px] font-sans font-medium tracking-wide transition-all select-none"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <div
                className="absolute top-[-20px] left-1/2 -translate-x-1/2 w-[52px] h-[52px] rounded-full bg-[var(--primary)] flex items-center justify-center border-[4px] border-[var(--bg-oled)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
                style={{
                  boxShadow: '0 0 16px var(--primary-glow)',
                }}
              >
                <Icon size={24} className="text-white" />
              </div>
              <span className={isActive ? 'text-[var(--primary)] font-semibold' : 'text-[var(--text-secondary)]'}>
                {label}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={path}
            to={path}
            className="flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-sans font-medium tracking-wide transition-all select-none"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <Icon
              size={20}
              strokeWidth={isActive ? 2.5 : 2}
              fill={isActive ? 'var(--primary)' : 'none'}
              className="transition-colors duration-200"
              style={{
                stroke: isActive ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            />
            <span className={isActive ? 'text-[var(--primary)] font-semibold' : 'text-[var(--text-secondary)]'}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
