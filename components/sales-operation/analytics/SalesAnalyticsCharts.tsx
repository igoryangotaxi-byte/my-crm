"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axisTick = { fontSize: 12, fill: "#6b7280" } as const;
const gridStroke = "#eef0f3";

const tooltipProps = {
  cursor: { fill: "rgba(15,18,24,0.04)" },
  contentStyle: {
    borderRadius: 12,
    border: "1px solid #e9ebf0",
    boxShadow: "0 12px 32px rgba(16,24,40,0.12)",
    fontSize: 12,
    padding: "8px 10px",
  },
  labelStyle: { color: "#14161a", fontWeight: 600 },
} as const;

export function StatusBarChart({
  data,
}: {
  data: Array<{ status: string; count: number }>;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
          <XAxis dataKey="status" tick={axisTick} tickLine={false} axisLine={{ stroke: gridStroke }} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="count" fill="#ff2d2d" radius={[8, 8, 0, 0]} maxBarSize={56} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CampaignsBarChart({
  data,
}: {
  data: Array<{ campaignName: string; count: number }>;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={{ stroke: gridStroke }} />
          <YAxis
            type="category"
            dataKey="campaignName"
            width={120}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="count" radius={[0, 8, 8, 0]} maxBarSize={26} animationDuration={500}>
            {data.map((entry, index) => (
              <Cell key={entry.campaignName} fill={index % 2 === 0 ? "#ff2d2d" : "#ff6b6b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
