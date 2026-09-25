"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_HEX } from "@/lib/ui/tokens";

const axisTick = { fontSize: 12, fill: CHART_HEX.muted } as const;
const gridStroke = CHART_HEX.grid;

const tooltipProps = {
  cursor: { fill: "rgba(15,18,24,0.04)" },
  contentStyle: {
    borderRadius: 12,
    border: `1px solid ${CHART_HEX.border}`,
    boxShadow: "0 12px 32px rgba(16,24,40,0.12)",
    fontSize: 12,
    padding: "8px 10px",
  },
  labelStyle: { color: CHART_HEX.text, fontWeight: 500 },
} as const;

const STATUS_COLORS: Record<string, string> = {
  new: CHART_HEX.chart3,
  in_progress: CHART_HEX.chart5,
  registered: CHART_HEX.chart4,
  rejected: CHART_HEX.chart1,
};

const LICENSE_COLORS: Record<string, string> = {
  with: CHART_HEX.chart4,
  without: CHART_HEX.chart1,
  unknown: CHART_HEX.muted,
};

function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="h-[18rem] w-full min-w-0">{children}</div>;
}

export function DriversStatusBarChart({
  data,
}: {
  data: Array<{ key: string; label: string; count: number }>;
}) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: gridStroke }} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56} animationDuration={500}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={STATUS_COLORS[entry.key] ?? CHART_HEX.chart1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function DriversLicenseMixChart({
  data,
}: {
  data: Array<{ key: string; label: string; count: number }>;
}) {
  const pieData = data.filter((row) => row.count > 0);
  const renderData = pieData.length > 0 ? pieData : data;
  const total = data.reduce((sum, row) => sum + row.count, 0);
  const radialData = [...data]
    .filter((row) => row.count > 0 || total === 0)
    .map((row) => ({
      ...row,
      fill: LICENSE_COLORS[row.key] ?? CHART_HEX.chart2,
      share: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <ChartFrame>
      <div className="grid h-full min-h-0 grid-cols-1 gap-2 md:grid-cols-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Tooltip {...tooltipProps} />
            <Pie
              data={renderData}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={84}
              paddingAngle={2}
              stroke="none"
            >
              {renderData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={LICENSE_COLORS[entry.key] ?? CHART_HEX.chart2}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="28%"
            outerRadius="92%"
            data={radialData.length > 0 ? radialData : data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, Math.max(total, 1)]} tick={false} />
            <Tooltip
              {...tooltipProps}
              formatter={(value, _name, item) => {
                const payload = item?.payload as
                  | { label?: string; share?: number; count?: number }
                  | undefined;
                const count = typeof value === "number" ? value : Number(value);
                const share = payload?.share ?? 0;
                return [`${count.toLocaleString()} (${share}%)`, payload?.label ?? "Count"];
              }}
            />
            <RadialBar
              dataKey="count"
              background={{ fill: "rgba(15,18,24,0.04)" }}
              cornerRadius={8}
            >
              {(radialData.length > 0 ? radialData : data).map((entry) => (
                <Cell
                  key={entry.key}
                  fill={LICENSE_COLORS[entry.key] ?? CHART_HEX.chart2}
                />
              ))}
            </RadialBar>
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

export function DriversHorizontalBarChart({
  data,
  nameKey = "label",
}: {
  data: Array<{ label: string; count: number }>;
  nameKey?: string;
}) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: gridStroke }}
          />
          <YAxis
            type="category"
            dataKey={nameKey}
            width={120}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="count" radius={[0, 8, 8, 0]} maxBarSize={26} animationDuration={500}>
            {data.map((entry, index) => (
              <Cell
                key={`${entry.label}-${index}`}
                fill={index % 2 === 0 ? CHART_HEX.chart1 : CHART_HEX.chart2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function DriversIntakeLineChart({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
          <XAxis
            dataKey="date"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: gridStroke }}
            tickFormatter={(value: string) => value.slice(5)}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Line
            type="monotone"
            dataKey="count"
            stroke={CHART_HEX.chart1}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
