import { PageHeader } from '../components/layout/PageHeader';
import { DashboardKPICard } from '../components/dashboard/DashboardKPICard';
import { SalesChart } from '../components/dashboard/SalesChart';
import { VisitorsChart } from '../components/dashboard/VisitorsChart';
import { Users, TrendingUp, Package, ShoppingCart, BarChart2 } from '../components/dashboard/DashboardIcons';

export function DashboardPage() {
  // User name from auth context - using placeholder for now
  const userName = 'Maria';

  const kpiData = [
    { icon: <Users />, label: 'Visitas', value: '12.4k', change: '+15%', changePositive: true },
    { icon: <TrendingUp />, label: 'Vendas', value: 'R$ 45.8k', change: '+8%', changePositive: true },
    { icon: <Package />, label: 'Pedidos', value: '892', change: '+23%', changePositive: true },
    { icon: <Users />, label: 'Visitantes', value: '3.2k', change: '-5%', changePositive: false },
    { icon: <ShoppingCart />, label: 'Ticket Médio', value: 'R$ 51.40', change: '+12%', changePositive: true },
    { icon: <BarChart2 />, label: 'SKUs', value: '156', change: '+4%', changePositive: true },
  ];

  return (
    <div className="page">
      <PageHeader
        titulo={`Olá, ${userName}!`}
        descricao="Aqui está o resumo da sua loja hoje."
      />

      {/* KPI Cards Grid */}
      <div className="dashboard-kpi-grid">
        {kpiData.map((kpi, index) => (
          <DashboardKPICard
            key={index}
            icon={kpi.icon}
            label={kpi.label}
            value={kpi.value}
            change={kpi.change}
            changePositive={kpi.changePositive}
          />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-main-grid">
        {/* Left Column */}
        <div className="dashboard-left-column">
          {/* Sales Chart */}
          <div className="dashboard-chart-card">
            <div className="dashboard-card-header">
              <h3>Vendas por Período</h3>
              <button className="btn-link">Ver relatório</button>
            </div>
            <SalesChart />
          </div>

          {/* Orders Section */}
          <div className="dashboard-orders-card">
            <div className="dashboard-card-header">
              <h3>Pedidos Recentes</h3>
              <button className="btn-link">Ver todos</button>
            </div>
            <div className="dashboard-orders-list">
              {[
                { id: 1, cliente: 'Tech Solutions', produto: 'Notebook Pro', valor: 'R$ 2.450', status: 'entregue', data: 'Hoje 10:30' },
                { id: 2, cliente: 'Comercial Silva', produto: 'Impressora Laser', valor: 'R$ 1.890', status: 'enviado', data: 'Ontem 15:45' },
                { id: 3, cliente: 'Indústria Global', produto: 'Servidor 24U', valor: 'R$ 8.750', status: 'pago', data: '20/09 09:15' },
                { id: 4, cliente: 'Alimentos Brasil', produto: 'Caixa de Papel', valor: 'R$ 425', status: 'analise', data: '19/09 14:20' },
                { id: 5, cliente: 'Educa Mais', produto: 'Kit Escola', valor: 'R$ 1.680', status: 'entregue', data: '18/09 11:00' },
              ].map((order) => (
                <div key={order.id} className="dashboard-order-item">
                  <div className="order-avatar">
                    {order.cliente.charAt(0)}
                  </div>
                  <div className="order-info">
                    <div className="order-client">{order.cliente}</div>
                    <div className="order-product">{order.produto}</div>
                  </div>
                  <div className="order-value">{order.valor}</div>
                  <div className="order-status">
                    <span className={`order-status-dot ${order.status}`} />
                    <span>{order.status}</span>
                  </div>
                  <div className="order-time">{order.data}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Heatmap */}
          <div className="dashboard-heatmap-card">
            <h3>Atividade por Dia da Semana</h3>
            <div className="heatmap-container">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <div key={day} className="heatmap-day">
                  <div className="heatmap-value" style={{ height: `${day * 20}%` }}>{day}</div>
                  <div className="heatmap-label">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day - 1]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="dashboard-right-column">
          {/* Notifications */}
          <div className="dashboard-notifications-card">
            <h3>Notificações</h3>
            <div className="notifications-list">
              {[
                { id: 1, title: 'Novo pedido recebido', message: 'Tech Solutions comprou Notebook Pro', time: 'Há 5 min', type: 'success' },
                { id: 2, title: 'Pedido atrasado', message: 'Alimentos Brasil - 2 dias de atraso', time: 'Há 2h', type: 'warning' },
                { id: 3, title: 'Estoque baixo', message: 'SKUs de papel a4 abaixo do mínimo', time: 'Há 4h', type: 'danger' },
                { id: 4, title: 'Pagamento recebido', message: 'Indústria Global - R$ 8.750', time: 'Ontem 16:30', type: 'success' },
                { id: 5, title: 'Feedback de cliente', message: 'Cliente satisfeito com tempo de entrega', time: '2 dias atrás', type: 'info' },
              ].map((notif) => (
                <div key={notif.id} className={`notification-item ${notif.type}`}>
                  <div className="notification-dot" />
                  <div className="notification-content">
                    <div className="notification-title">{notif.title}</div>
                    <div className="notification-message">{notif.message}</div>
                    <div className="notification-time">{notif.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Log */}
          <div className="dashboard-activity-card">
            <h3>Log de Atividades</h3>
            <div className="activity-timeline">
              {[
                { time: '10:30', action: 'Pedido criado', user: 'Maria S.', type: 'order' },
                { time: '14:15', action: 'Pagamento confirmado', user: 'João P.', type: 'payment' },
                { time: '15:45', action: 'Produto enviado', user: 'Ana L.', type: 'shipment' },
                { time: '16:30', action: 'Novo cliente cadastrado', user: 'Sistema', type: 'customer' },
                { time: '17:00', action: 'Alteração de preço', user: 'Carlos R.', type: 'price' },
              ].map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-time">{activity.time}</div>
                  <div className={`activity-dot ${activity.type}`} />
                  <div className="activity-content">
                    <div className="activity-action">{activity.action}</div>
                    <div className="activity-user">por {activity.user}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visitors Chart */}
          <div className="dashboard-visitors-card">
            <div className="dashboard-card-header">
              <h3>Visitas ao Site</h3>
              <button className="btn-link">Ver analítico</button>
            </div>
            <VisitorsChart />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        {/* Top Products */}
        <div className="footer-section">
          <h4>Produtos Mais Visitados</h4>
          <ul className="footer-list">
            <li>Notebook Pro - 1.2k visitas</li>
            <li>Papel A4 - 980 visitas</li>
            <li>Impressora Laser - 750 visitas</li>
            <li>Kit Escola - 620 visitas</li>
            <li>Servidor 24U - 480 visitas</li>
          </ul>
        </div>

        {/* Customers by State */}
        <div className="footer-section">
          <h4>Clientes por Estado</h4>
          <ul className="footer-list">
            <li>SP - 45 clientes</li>
            <li>RJ - 32 clientes</li>
            <li>MG - 28 clientes</li>
            <li>BA - 24 clientes</li>
            <li>RS - 18 clientes</li>
          </ul>
        </div>

        {/* Inventory History */}
        <div className="footer-section">
          <h4>Histórico de Estoque</h4>
          <ul className="footer-list">
            <li>SKUs em alta: +15% este mês</li>
            <li>Movimentação: 2.4k entradas</li>
            <li>Saídas: 1.8k saídas</li>
            <li>Saldo atual: 156 SKUs</li>
            <li>Valor total: R$ 45.8k</li>
          </ul>
        </div>
      </div>
    </div>
  );
}