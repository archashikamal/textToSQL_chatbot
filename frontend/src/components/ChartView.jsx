import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { humanize } from '../utils/chartAnalysis'

const BAR_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ef4444']
const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

function ReadableXAxis({ dataKey, tickCount }) {
  return (
    <XAxis
      dataKey={dataKey}
      tick={{ fontSize: 11, fill: '#64748b' }}
      interval={0}
      angle={tickCount > 8 ? -30 : 0}
      textAnchor={tickCount > 8 ? 'end' : 'middle'}
      height={tickCount > 8 ? 50 : 30}
      label={{ value: humanize(dataKey), position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
    />
  )
}

/**
 * Renders the chart already decided by `analyzeChart` (see ../utils/chartAnalysis).
 * This component does no detection itself -- it just draws whatever `chart`
 * describes, so the same analysis result can be reused (e.g. to decide whether
 * to show the Chart tab at all) without re-running it.
 */
export default function ChartView({ chart, rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No data to chart.
      </div>
    )
  }

  if (!chart) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        This result shape isn't suitable for a chart — showing the table instead.
      </div>
    )
  }

  const ChartTag = chart.kind === 'line' ? LineChart : BarChart

  return (
    <div className="space-y-2">
      <div className="h-72 rounded-lg border border-slate-200 bg-white p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ChartTag data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: chart.data.length > 8 ? 22 : 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <ReadableXAxis dataKey={chart.labelCol} tickCount={chart.data.length} />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(v) => compactNumber.format(v)}
              width={44}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              cursor={chart.kind === 'bar' ? { fill: '#f1f5f9' } : undefined}
              formatter={(value, name) => [typeof value === 'number' ? value.toLocaleString() : value, humanize(name)]}
              labelFormatter={(label) => `${humanize(chart.labelCol)}: ${label}`}
            />
            {chart.valueCols.length > 1 && <Legend formatter={humanize} wrapperStyle={{ fontSize: 12 }} />}
            {chart.valueCols.map((col, i) =>
              chart.kind === 'line' ? (
                <Line
                  key={col}
                  type="monotone"
                  dataKey={col}
                  stroke={BAR_COLORS[i % BAR_COLORS.length]}
                  strokeWidth={2}
                  dot={chart.data.length <= 30}
                  connectNulls
                  name={col}
                />
              ) : (
                <Bar key={col} dataKey={col} fill={BAR_COLORS[i % BAR_COLORS.length]} radius={[3, 3, 0, 0]} name={col} />
              ),
            )}
          </ChartTag>
        </ResponsiveContainer>
      </div>
      {chart.truncated && (
        <p className="text-xs text-slate-500">
          Showing {chart.shownCount} of {chart.totalCount} rows{chart.kind === 'line' ? ' (downsampled)' : ''}.
        </p>
      )}
    </div>
  )
}
