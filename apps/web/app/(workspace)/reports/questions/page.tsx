import type { Metadata } from 'next';
import { QuestionsView } from '@/components/reports/questions-view';
import { getWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Report questions' };

export default function QuestionsPage() {
  const clients = getWorkspace().clients.map((client) => ({
    id: client.id,
    name: client.name,
  }));
  return <QuestionsView clients={clients} />;
}
