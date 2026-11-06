import { IllustratedPanel } from '@/components/auth/statement-panel';
import stamp from '@/public/illustrations/stamp.png';

/** Beside resetting a password: nothing is lost by being locked out. */
export function LockedOutPanel() {
  return (
    <IllustratedPanel
      tone="lilac"
      title={
        <>
          Locked out
          <br />
          happens.
        </>
      }
      body="Your files stay exactly where they were. Nothing in your tools changes."
      illustration={stamp}
      illustrationClassName="top-[57%] left-[43%] w-[min(78%,75vh)] -translate-x-1/2 -translate-y-1/2"
    />
  );
}
