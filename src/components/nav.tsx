'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/logs', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">
          PumpTrack
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-sm transition-colors hover:text-primary',
                pathname === item.href
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="outline" size="icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-0">
            <div className="flex flex-col h-full">
              <div className="px-6 pt-6 pb-5 border-b border-border">
                <p className="font-bold text-base">PumpTrack</p>
                <p className="text-xs text-muted-foreground mt-0.5">IoT Irrigation Monitor</p>
              </div>
              <nav className="flex flex-col px-3 pt-4 pb-6 gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] transition-all duration-150',
                      'hover:scale-[1.02] hover:bg-accent',
                      pathname === item.href
                        ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[14px]'
                        : 'text-muted-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
