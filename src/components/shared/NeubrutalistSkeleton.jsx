import React from 'react';

export const NeubrutalistSkeleton = () => (
  <div className="w-full max-w-[1440px] mx-auto px-4 py-8 flex flex-col gap-8 text-white select-none animate-pulse">
    {/* Header Skeleton */}
    <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[6px_6px_0px_black] flex flex-col gap-3 text-left">
      <div className="w-48 h-6 bg-[var(--bg-elevated)] rounded-md" />
      <div className="w-80 h-4 bg-[var(--bg-elevated)] rounded-md opacity-60" />
    </div>

    {/* Content Grid Skeletons */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1, 2, 3].map((cardIdx) => (
        <div 
          key={cardIdx} 
          className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[6px_6px_0px_black] flex flex-col gap-5 text-left"
        >
          {/* Card Header */}
          <div className="flex justify-between items-center border-b border-[#222] pb-3">
            <div className="flex flex-col gap-2">
              <div className="w-24 h-3 bg-[var(--bg-elevated)] rounded" />
              <div className="w-32 h-5 bg-[var(--bg-elevated)] rounded" />
            </div>
            <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[#222]" />
          </div>

          {/* Card Body Metrics */}
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((metricIdx) => (
              <div 
                key={metricIdx} 
                className="border-2 border-black bg-black/40 p-3 rounded-xl flex flex-col gap-2"
              >
                <div className="w-12 h-2.5 bg-[var(--bg-elevated)] rounded" />
                <div className="w-8 h-4 bg-[var(--bg-elevated)] rounded" />
              </div>
            ))}
          </div>

          {/* Card Footer Lines */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="w-full h-3 bg-[var(--bg-elevated)] rounded" />
            <div className="w-3/4 h-3 bg-[var(--bg-elevated)] rounded" />
          </div>
        </div>
      ))}
    </div>

    {/* Large Panel Skeleton */}
    <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[6px_6px_0px_black] flex flex-col gap-4 text-left">
      <div className="w-36 h-5 bg-[var(--bg-elevated)] rounded" />
      <div className="flex flex-col gap-3">
        <div className="w-full h-4 bg-[var(--bg-elevated)] rounded" />
        <div className="w-11/12 h-4 bg-[var(--bg-elevated)] rounded" />
        <div className="w-10/12 h-4 bg-[var(--bg-elevated)] rounded" />
      </div>
    </div>
  </div>
);

export default NeubrutalistSkeleton;
