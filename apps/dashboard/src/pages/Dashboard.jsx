import ChannelFeeds from "../components/ChannelFeeds";
import {
  StatsBar,
  ChannelBreakdown,
  TicketTable,
  AccuracySpark,
} from "../components/DashboardWidgets";
import { IncidentCard, KBList } from "../components/Ops";

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <StatsBar />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <ChannelBreakdown />
          <TicketTable />
        </div>
        <div className="space-y-4">
          <IncidentCard />
          <KBList />
          <AccuracySpark />
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-3 mt-4">
          Simulated Channels (PRD §5.1 — multi-channel ingestion)
        </div>
        <ChannelFeeds />
      </div>
    </div>
  );
}
