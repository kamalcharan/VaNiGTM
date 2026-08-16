'use client';

/**
 * Root gate. P0 has no auth, so this lands straight on the console. P1 replaces
 * this with the authenticated redirect (dashboard when signed in, login when not).
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function IndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return null;
}
