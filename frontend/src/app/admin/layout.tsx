'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminApi, getToken, removeToken } from '@/lib/api';
import AppTopNav from '@/components/AppTopNav';

const AUTH_VERIFY_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Auth verification timed out')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    try {
      await withTimeout(adminApi.verify(), AUTH_VERIFY_TIMEOUT_MS);
      setIsAuthenticated(true);
    } catch {
      removeToken();
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    const safetyTimer = window.setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, AUTH_VERIFY_TIMEOUT_MS + 1500);

    checkAuth().finally(() => {
      window.clearTimeout(safetyTimer);
    });

    return () => {
      isMounted = false;
      window.clearTimeout(safetyTimer);
    };
  }, [checkAuth, pathname]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/admin') {
      router.push('/admin');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // Ignore logout errors
    }
    removeToken();
    setIsAuthenticated(false);
    router.push('/admin');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated && pathname !== '/admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppTopNav onLogout={handleLogout} />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
