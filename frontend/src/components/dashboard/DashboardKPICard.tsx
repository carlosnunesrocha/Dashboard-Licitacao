import type { ReactNode } from 'react';

interface DashboardKPICardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  change?: string;
  changePositive?: boolean;
}

export function DashboardKPICard({
  icon,
  label,
  value,
  change,
  changePositive,
}: DashboardKPICardProps) {
  return (
    <div className="dashboard-kpi-card">
      <div className="dashboard-kpi-icon">{icon}</div>
      <div className="dashboard-kpi-content">
        <label className="dashboard-kpi-label">{label}</label>
        <div className="dashboard-kpi-row">
          <span className="dashboard-kpi-value">{value}</span>
          {change && (
            <span className={`dashboard-kpi-change ${changePositive ? 'positive' : 'negative'}`}>
              {change}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}