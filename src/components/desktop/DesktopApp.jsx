import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { DesktopSidebar } from './DesktopSidebar';
import { NeubrutalistSkeleton } from '../shared/NeubrutalistSkeleton';

export const DesktopApp = () => {
  return (
    <div style={{ height: '100dvh' }} className="bg-[var(--bg-oled)] text-[var(--text-primary)] flex overflow-hidden">
      {/* Left Sidebar */}
      <DesktopSidebar />

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <Suspense fallback={<NeubrutalistSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default DesktopApp;
