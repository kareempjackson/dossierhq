import Image from 'next/image';
import { AuthPanelTitle } from '@/components/auth/auth-shell';
import { PatternPanel } from '@/components/auth/pattern-panel';
import files from '@/public/illustrations/17-brain-of-files 1.png';

/**
 * The pattern, and the stack of files below the statement. The stack sits in
 * the artwork's lower right, so its empty top tucks under the text (-mt is a
 * share of the panel's width, like the artwork's) and never covers it.
 */
export function SignUpPanel() {
  return (
    <PatternPanel>
      <div className="flex flex-1 flex-col justify-end">
        <div className="relative z-10 mb-4 px-8 xl:px-14">
          <AuthPanelTitle>
            Every client,
            <br />
            read and cited.
          </AuthPanelTitle>
          <p className="mt-6 max-w-md">
            Connect NinjaOne, Hudu, SharePoint and Fathom. Dossier only ever
            reads.
          </p>
        </div>
        <Image
          src={files}
          alt=""
          sizes="(min-width: 1280px) 25rem, 28vw"
          loading="eager"
          className="pointer-events-none -mt-[18%] h-auto w-[57%] max-w-[28rem] self-end"
        />
      </div>
    </PatternPanel>
  );
}
