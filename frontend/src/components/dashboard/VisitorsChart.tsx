interface VisitorData {
  name: string;
  visits: number;
}

export function VisitorsChart() {
  const data: VisitorData[] = [
    { name: 'Seg', visits: 120 },
    { name: 'Ter', visits: 180 },
    { name: 'Qua', visits: 140 },
    { name: 'Qui', visits: 210 },
    { name: 'Sex', visits: 320 },
    { name: 'Sáb', visits: 280 },
    { name: 'Dom', visits: 160 },
  ];

  const max = Math.max(...data.map((d) => d.visits));
  const chartHeight = 180;
  const chartWidth = 300;
  const barWidth = 28;
  const gap = 12;

  return (
    <div className="visitors-chart-container">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`} width="100%" height="auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const y = chartHeight - frac * chartHeight;
          return (
            <line
              key={i}
              x1="0"
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.visits / max) * chartHeight;
          const x = i * (barWidth + gap) + gap / 2;
          const y = chartHeight - barH;
          return (
            <g key={d.name}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx="4"
                fill="var(--accent)"
                opacity="0.85"
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {d.visits}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="11"
              >
                {d.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}