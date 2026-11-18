import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { NotesView } from '@/components/clients/notes-view';
import { clientNoteViews } from '@/lib/client-views';
import { getClientNotes } from '@/lib/data/notes';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/notes'>) => clientTabMetadata(params, 'Notes');

/** The notes filed with the client, newest meeting first. */
export default function NotesPage({
  params,
}: PageProps<'/clients/[id]/notes'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const notes = await getClientNotes(client.id).catch(orNull);
        if (notes === null) {
          return <ReadFailed what="this client’s notes" />;
        }
        return (
          <NotesView
            clientName={client.name}
            notes={clientNoteViews(notes, context)}
            readOnly={context.support}
          />
        );
      }}
    />
  );
}
