import Image from 'next/image';
import { AuthPanelTitle } from '@/components/auth/auth-shell';
import { PatternPanel } from '@/components/auth/pattern-panel';
import cabinet from '@/public/illustrations/10-original-cabinet 1.png';

/** The pattern, and the cabinet beside the statement: one file per client. */
export function SignInPanel() {
  return (
    <PatternPanel>
      <div className="relative z-10 flex flex-1 items-end px-8 pb-[22vh] xl:px-14">
        <div className="max-w-60">
          <AuthPanelTitle>
            One file
            <br />
            per client.
          </AuthPanelTitle>
          <p className="mt-6">
            Devices, files and meetings from the tools you already use, with the
            record behind every line.
          </p>
        </div>
      </div>

      <Image
        src={cabinet}
        alt=""
        sizes="(min-width: 1280px) 30rem, 28vw"
        loading="eager"
        className="pointer-events-none absolute right-0 bottom-6 h-auto w-[50%] max-w-[30rem] xl:w-[64%]"
      />
    </PatternPanel>
  );
}
