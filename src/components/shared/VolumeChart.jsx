import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

// Helper to format ISO week "YYYY-WNN" to just "WNN" (e.g. "W23")
const formatXAxisWeek = (weekStr) => {
  if (!weekStr) return '';
  const parts = weekStr.split('-W');
  if (parts.length === 2) {
    return `W${parts[1]}`;
  }
  return weekStr;
};

// Custom Tooltip component matching OLED dark Neubrutalism theme
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    const formattedWeek = formatXAxisWeek(dataPoint.week);
    return (
      <div className="bg-[#1A1A1A] border border-[#333333] p-2.5 rounded shadow-[0_4px_12px_rgba(0,0,0,0.9)] font-mono text-xs text-[#F0F0F0]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[#FF5C00] font-semibold">{dataPoint.totalVolume} kg</span>
          <span className="text-[#888888] text-[10px] mt-0.5">Week: {formattedWeek}</span>
        </div>
      </div>
    );
  }
  return null;
};

// Skeleton loading component
const ChartSkeleton = () => (
  <div className="w-full h-[240px] bg-[#111111] border border-[#222222] rounded-lg p-4 flex flex-col justify-between animate-pulse">
    <div className="h-4 bg-[#222222] rounded w-1/4 mb-4"></div>
    <div className="flex-1 flex items-end justify-between gap-2">
      <div className="w-8 bg-[#222222] rounded-t" style={{ height: '30%' }}></div>
      <div className="w-8 bg-[#222222] rounded-t" style={{ height: '50%' }}></div>
      <div className="w-8 bg-[#222222] rounded-t" style={{ height: '40%' }}></div>
      <div className="w-8 bg-[#222222] rounded-t" style={{ height: '70%' }}></div>
      <div className="w-8 bg-[#222222] rounded-t" style={{ height: '55%' }}></div>
      <div className="w-8 bg-[#222222] rounded-t" style={{ height: '80%' }}></div>
    </div>
  </div>
);

// Empty State component
const EmptyState = () => (
  <div className="w-full h-[240px] bg-[#111111] border border-[#222222] rounded-lg flex flex-col items-center justify-center text-center p-6">
    <div className="p-3 bg-[#1A1A1A] rounded-full border border-[#222222] mb-3">
      <BarChart2 className="w-8 h-8 text-[#888888] stroke-[1.5]" />
    </div>
    <p className="text-sm font-medium text-[#F0F0F0] font-sans">
      Start logging to see weekly volume
    </p>
    <p className="text-xs text-[#888888] mt-1 font-sans max-w-[280px]">
      Your cumulative weekly training volume trends will display here.
    </p>
  </div>
);

export const VolumeChart = ({ data = [], loading = false }) => {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);

  if (loading) return <ChartSkeleton />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <div className="w-full h-[240px] bg-[#111111] border border-[#222222] rounded-lg p-2 relative">
      <ResponsiveContainer key={sidebarOpen ? 'open' : 'closed'} width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
          <XAxis
            dataKey="week"
            tickFormatter={formatXAxisWeek}
            tick={{ fill: '#888888', fontSize: 11, fontFamily: 'DM Mono' }}
            stroke="#222222"
            dy={8}
          />
          <YAxis
            tick={{ fill: '#888888', fontSize: 11, fontFamily: 'DM Mono' }}
            stroke="#222222"
            unit=" kg"
            width={52}
            dx={-4}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 92, 0, 0.05)' }} />
          <Bar
            dataKey="totalVolume"
            fill="#FF5C00"
            radius={[4, 4, 0, 0]}
            activeBar={{ fill: '#FF7C2A' }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
