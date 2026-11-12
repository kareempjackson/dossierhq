import type { Metadata } from 'next';
import { ReadFailed } from '@/components/clients/client-tab';
import { QuestionsView } from '@/components/reports/questions-view';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getClientNames } from '@/lib/data/clients';
import { getReportQuestions } from '@/lib/data/reports';
import { orNull } from '@/lib/data/safe';

export const metadata: Metadata = { title: 'Report questions' };

export default function QuestionsPage() {
  return (
    <Reveal
      fallback={<IndexLoader className="h-80" label="Loading the questions" />}
    >
      <Questions />
    </Reveal>
  );
}

async function Questions() {
  const [questions, names] = await Promise.all([
    getReportQuestions().catch(orNull),
    getClientNames().catch(orNull),
  ]);
  if (questions === null) return <ReadFailed what="the report questions" />;
  return (
    <QuestionsView
      questions={questions.map(({ id, text, clientId }) => ({
        id,
        text,
        clientId,
      }))}
      clients={[...(names ?? new Map<string, string>())]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}
