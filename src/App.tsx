import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Machines from '@/pages/Machines';
import MachineDetail from '@/pages/MachineDetail';
import Snapshots from '@/pages/Snapshots';
import Ports from '@/pages/Ports';
import Secrets from '@/pages/Secrets';
import Webhooks from '@/pages/Webhooks';
import Exports from '@/pages/Exports';
import Usage from '@/pages/Usage';
import Templates from '@/pages/Templates';
import Playground from '@/pages/Playground';
import Settings from '@/pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="machines" element={<Machines />} />
        <Route path="machines/:id" element={<MachineDetail />} />
        <Route path="snapshots" element={<Snapshots />} />
        <Route path="ports" element={<Ports />} />
        <Route path="secrets" element={<Secrets />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="exports" element={<Exports />} />
        <Route path="usage" element={<Usage />} />
        <Route path="templates" element={<Templates />} />
        <Route path="playground" element={<Playground />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<div className="text-dim">页面不存在</div>} />
      </Route>
    </Routes>
  );
}
