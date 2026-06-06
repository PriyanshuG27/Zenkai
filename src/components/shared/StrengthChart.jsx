import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Dumbbell } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

// Helper to format Date string "YYYY-MM-DD" to "DD MMM" (e.g. "15 Apr")
const formatXAxisDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(date.getTime())) return dateStr;
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  return `${day} ${month}`;
};

// Custom Tooltip component matching OLED dark Neubrutalism theme
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    const formattedDate = formatXAxisDate(dataPoint.date);
    return (
      <div className="bg-[#1A1A1A] border-2 border-[#333333] p-2.5 rounded shadow-[4px_4px_0px_rgba(0,0,0,1)] font-mono text-xs text-[#F0F0F0]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#00D4FF] font-extrabold">{dataPoint.maxWeight} kg</span>
          <span className="text-[#888888] font-bold">×</span>
          <span className="text-[#F0F0F0] font-bold">{dataPoint.maxReps} reps</span>
        </div>
        <span className="text-[#888888] block mt-1 text-[10px]">on {formattedDate}</span>
      </div>
    );
  }
  return null;
};

// Skeleton loading component
const ChartSkeleton = () => (
  <div className="w-full h-[240px] bg-[#111111] border-2 border-[#222222] rounded-lg p-4 flex flex-col justify-between animate-pulse">
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
const EmptyState = ({ exerciseName }) => (
  <div className="w-full h-[240px] bg-[#111111] border-2 border-[#222222] rounded-lg flex flex-col items-center justify-center text-center p-6 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
    <div className="p-3 bg-[#1A1A1A] rounded-full border border-[#222222] mb-3">
      <Dumbbell className="w-8 h-8 text-[#888888] stroke-[1.5]" />
    </div>
    <p className="text-sm font-bold text-[#F0F0F0] font-sans">
      Log {exerciseName || 'exercises'} to see strength progress
    </p>
    <p className="text-xs text-[#888888] mt-1 font-sans max-w-[280px]">
      Your estimated 1RM progression timeline will build automatically.
    </p>
  </div>
);

export const StrengthChart = ({ data = [], exerciseName = '', loading = false }) => {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);

  if (loading) return <ChartSkeleton />;
  if (!data || data.length === 0) return <EmptyState exerciseName={exerciseName} />;

  return (
    <div className="w-full h-[240px] bg-[#111111] border-2 border-[#222222] rounded-lg p-2 relative shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <ResponsiveContainer key={sidebarOpen ? 'open' : 'closed'} width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="colorMaxWeight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.35}/>
              <stop offset="95%" stopColor="#00D4FF" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxisDate}
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
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#222222', strokeWidth: 1.5 }} />
          <Area
            type="monotone"
            dataKey="maxWeight"
            stroke="#00D4FF"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorMaxWeight)"
            isAnimationActive={true}
            dot={{ fill: '#00D4FF', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#00D4FF', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
