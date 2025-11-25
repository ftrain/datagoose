import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';

interface DataPoint {
  name: string;
  value: number;
  [key: string]: number | string | null;
}

interface BarChartProps {
  data: DataPoint[];
  dataKey?: string;
  nameKey?: string;
  title?: string;
  color?: string;
  colors?: string[];
  formatValue?: (value: number) => string;
  height?: number;
  layout?: 'horizontal' | 'vertical';
  showLegend?: boolean;
  multipleBars?: { key: string; color: string; name: string }[];
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1'
];

export function BarChart({
  data,
  dataKey = 'value',
  nameKey = 'name',
  title,
  color,
  colors = COLORS,
  formatValue = (v) => v.toLocaleString(),
  height = 300,
  layout = 'horizontal',
  showLegend = false,
  multipleBars,
}: BarChartProps) {
  const isVertical = layout === 'vertical';

  return (
    <div className="w-full">
      {title && <h4 className="text-sm font-medium mb-2">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          layout={isVertical ? 'vertical' : 'horizontal'}
          margin={{ top: 5, right: 20, left: isVertical ? 100 : 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          {isVertical ? (
            <>
              <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={formatValue} />
              <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#6b7280" width={90} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#6b7280" />
              <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={formatValue} />
            </>
          )}
          <Tooltip
            formatter={(value: number) => [formatValue(value), '']}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px'
            }}
          />
          {showLegend && <Legend />}
          {multipleBars ? (
            multipleBars.map((bar) => (
              <Bar key={bar.key} dataKey={bar.key} fill={bar.color} name={bar.name} />
            ))
          ) : (
            <Bar dataKey={dataKey} fill={color || colors[0]}>
              {!color && data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          )}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
