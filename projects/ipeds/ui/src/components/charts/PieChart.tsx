import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface PieChartProps {
  data: DataPoint[];
  title?: string;
  colors?: string[];
  formatValue?: (value: number) => string;
  height?: number;
  showLegend?: boolean;
  innerRadius?: number;
  outerRadius?: number;
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1'
];

export function PieChart({
  data,
  title,
  colors = COLORS,
  formatValue = (v) => v.toLocaleString(),
  height = 300,
  showLegend = true,
  innerRadius = 0,
  outerRadius = 80,
}: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="w-full">
      {title && <h4 className="text-sm font-medium mb-2">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            dataKey="value"
            label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(1)}%)`}
            labelLine={true}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [
              `${formatValue(value)} (${((value / total) * 100).toFixed(1)}%)`,
              ''
            ]}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px'
            }}
          />
          {showLegend && (
            <Legend
              formatter={(value) => <span className="text-sm">{value}</span>}
            />
          )}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
