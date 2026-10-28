import { Suspense } from 'react';
import { ReportQuestions } from '@/components/report/report-questions';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import { getClients, getReportQuestions } from '@/lib/data';
import { orEmpty, orNull } from '@/lib/data/safe';

export const metadata = { title: 'Report questions' };

export default function ReportQuestionsPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <Breadcrumb
          items={[
            { label: 'Reports', href: '/reports' },
            { label: 'Questions' },
          ]}
        />
        <h1 className="mt-4 text-title-compact sm:text-title">
          Report questions
        </h1>
        <p className="mt-3 max-w-160 text-meta text-muted">
          Each weekly report answers these from the client’s own records, and
          cites the records every answer rests on. When the records don’t say,
          the report says so rather than guess.
        </p>
        <div className="mt-8">
          <Suspense fallback={<QuestionsSkeleton />}>
            <Questions />
          </Suspense>
        </div>
      </div>
    </Sheet>
  );
}

async function Questions() {
  const [questions, clients] = await Promise.all([
    getReportQuestions().catch(orNull),
    getClients().catch(orEmpty),
  ]);
  if (questions === null) return <ErrorState what="report questions" />;
  return (
    <ReportQuestions
      questions={questions}
      clients={clients.map(({ id, name }) => ({ id, name }))}
    />
  );
}

function QuestionsSkeleton() {
  return (
    <div>
      <LoadingLabel what="report questions" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-40 w-full rounded-card" />
    </div>
  );
}
