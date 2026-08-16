'use client';

/**
 * Root gate. Sends people to the shell or to login once the bootstrap refresh
 * has settled — never before, or a reload would bounce an authenticated user
 * out to the login screen for a frame.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';

export default function IndexPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? '/home' : '/login');
  }, [isAuthenticated, isLoading, router]);

  return null;
}
