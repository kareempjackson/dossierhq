import { notFound } from 'next/navigation';

// Sends unknown URLs to (workspace)/not-found.tsx, so they keep the app shell.
export default function MissingPage() {
  notFound();
}
