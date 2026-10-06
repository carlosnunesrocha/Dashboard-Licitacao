interface SalesData {
  name: string;
  vendas: number;
}

export function SalesChart() {
  const data: SalesData[] = [
    { name: 'Jan', vendas: 1200 },
    { name: 'Fev', vendas: 1900 },
    { name: 'Mar', vendas: 1500 },
    { name: 'Abr', vendas: 2200 },
    { name: 'Mai', vendas: 1800 },
    { name: 'Jun', vendas: 2500 },
    { name: 'Jul', vendas: 2100 },
    { name: 'Ago', vendas: 2800 },
    { name: 'Set', vendas: 2400 },
  ];

  const chartWidth = 600;
  const chartHeight = 200;
  const paddingTop = 20;
  const paddingRight = 30;
  const paddingBottom = 30;
  const paddingLeft = 40;

  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  const minValue = Math.min(...data.map((d) => d.vendas));
  const maxValue = Math.max(...data.map((d) => d.vendas));
  const range = maxValue - minValue || 1;

  // Calculate points for the line
  const points = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1)) * graphWidth;
    const normalizedValue = (d.vendas - minValue) / range;
    const y = paddingTop + graphHeight - normalizedValue * graphHeight;
    return { x, y, data: d };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const y = paddingTop + (1 - frac) * graphHeight;
    const value = Math.round(minValue + frac * range);
    return { y, value };
  });

  return (
    <div className="dashboard-chart-container">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`} width="100%" height="auto">
        {/* Grid lines */}
        {gridLines.map((line, i) => (
          <line
            key={`grid-${i}`}
            x1={paddingLeft}
            y1={line.y}
            x2={chartWidth - paddingRight}
            y2={line.y}
            stroke="var(--border)"
            strokeDasharray="4 4"
            opacity="0.5"
          />
        ))}

        {/* Y-axis labels */}
        {gridLines.map((line, i) => (
          <text
            key={`label-${i}`}
            x={paddingLeft - 10}
            y={line.y + 4}
            textAnchor="end"
            fontSize="12"
            fill="var(--text-muted)"
          >
            {line.value}
          </text>
        ))}

        {/* Line chart */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="var(--danger)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="var(--danger)"
            opacity="0.9"
          />
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => (
          <text
            key={`x-label-${i}`}
            x={p.x}
            y={chartHeight + 20}
            textAnchor="middle"
            fontSize="12"
            fill="var(--text-muted)"
          >
            {p.data.name}
          </text>
        ))}

        {/* X-axis line */}
        <line
          x1={paddingLeft}
          y1={paddingTop + graphHeight}
          x2={chartWidth - paddingRight}
          y2={paddingTop + graphHeight}
          stroke="var(--border)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}