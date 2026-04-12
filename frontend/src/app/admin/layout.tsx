'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { adminApi, getToken, removeToken } from '@/lib/api';

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
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link href="/admin" className="text-xl font-bold text-gray-900">
                Resume Builder Admin
              </Link>
              <nav className="hidden md:flex space-x-4">
                <Link
                  href="/admin/profiles"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/profiles'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Profiles
                </Link>
                <Link
                  href="/admin/templates"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/templates'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Templates
                </Link>
                <Link
                  href="/admin/prompts"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/prompts'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Prompts
                </Link>
                <Link
                  href="/admin/groups"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/groups'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Groups
                </Link>
                <Link
                  href="/admin/skills"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/skills'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Skill Library
                </Link>
                <Link
                  href="/admin/settings"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/settings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Settings
                </Link>
                <Link
                  href="/admin/google-sheets"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/google-sheets'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Google Sheets
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Back to Builder
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
