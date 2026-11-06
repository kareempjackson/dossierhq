'use client';

import { useFormStatus } from 'react-dom';
import { signOut } from '@/app/(auth)/actions';
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/button';
import { useAppDispatch } from '@/lib/store/hooks';
import { sessionCleared } from '@/lib/store/session-slice';

/**
 * Signs out: the server ends the session and clears its cookie, and this
 * browser's store forgets who was signed in.
 */
export function SignOutButton({
  variant = 'outline',
  size = 'sm',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const dispatch = useAppDispatch();
  return (
    <form action={signOut} onSubmit={() => dispatch(sessionCleared())}>
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
