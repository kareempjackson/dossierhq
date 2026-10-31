import { notFound } from 'next/navigation';

// Sends unknown URLs to (admin)/not-found.tsx, so they keep the shell.
export default function MissingPage() {
  notFound();
}
