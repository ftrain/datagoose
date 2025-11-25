import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  year: number;
  [key: string]: number | string | null;
}

interface TrendChartProps {
  data: DataPoint[];
  dataKey: string;
  title?: string;
  xAxisKey?: string;
  color?: string;
  formatValue?: (value: number) => string;
  formatTooltip?: (value: number) => string;
  height?: number;
  showLegend?: boolean;
  multipleLines?: { key: string; color: string; name: string }[];
}

export function TrendChart({
  data,
  dataKey,
  title,
  xAxisKey = 'year',
  color = '#3b82f6',
  formatValue,
  formatTooltip,
  height = 300,
  showLegend = false,
  multipleLines,
}: TrendChartProps) {
  const formatter = formatTooltip || formatValue || ((v: number) => v.toLocaleString());

  return (
    <div className="w-full">
      {title && <h4 className="text-sm font-medium mb-2">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey={xAxisKey}
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickFormatter={formatValue}
          />
          <Tooltip
            formatter={(value: number) => [formatter(value), '']}
            labelFormatter={(label) => `Year: ${label}`}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px'
            }}
          />
          {showLegend && <Legend />}
          {multipleLines ? (
            multipleLines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                name={line.name}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
