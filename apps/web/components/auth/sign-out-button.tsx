'use client';

import { useFormStatus } from 'react-dom';
import { signOut } from '@/app/(auth)/actions';
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/button';

/**
 * Signs out: the server ends the session and clears its cookie, then sends
 * the browser to sign-in, where its store forgets who was signed in (see
 * ForgetSession).
 */
export function SignOutButton({
  variant = 'outline',
  size = 'sm',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <form action={signOut}>
      <Submit variant={variant} size={size} />
    </form>
  );
}

function Submit({
  variant,
  size,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
