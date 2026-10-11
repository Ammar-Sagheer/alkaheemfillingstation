'use client';

import { useState } from 'react';

import Button from '@/app/_components/ui/Button';
import Dialog from '@/app/_components/ui/Dialog';
import Icon from '@/app/_components/ui/Icon';
import StockCheckForm from '@/app/_components/admin/StockCheckForm';

/**
 * The day's dip, from the Readings page (asked for by Al Tufail, October 2026; built here for Al Hakeem at the owner's request). He dips the
 * tanks when he enters the readings, so the same per-tank dip form that is on
 * the Stock page opens here in a dialog, for the day on screen, instead of
 * going to Stock and picking the date again.
 *
 * It is the SAME `StockCheckForm` and the same action, so what a dip is checked
 * against, and everything the database refuses are
 * unchanged. The page hands it the day's existing dips so a tank already dipped
 * shows that, not an empty form.
 */
export default function DailyDipButton({
  tanks = [],
  date,
  checksByTank = {},
  earliestByTank = {},
  canManage = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  if (tanks.length === 0) return null;

  return (
    <>
      <Button variant="secondary" type="button" onClick={() => setIsOpen(true)}>
        <Icon name="stock" className="h-4 w-4" />
        Record the dip
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size="lg"
        title="Record the dip"
        subtitle={<span className="text-sm text-ink-600">Each tank's dip for {date}</span>}
      >
        <div className="grid gap-5 p-5 @container md:grid-cols-2">
          {tanks.map((tank) => (
            <StockCheckForm
              key={tank.id}
              tank={tank}
              date={date}
              existingCheck={checksByTank[tank.id] ?? null}
              earliestBooksDate={earliestByTank[tank.id] ?? null}
              openingStock={tank.opening_stock_litres}
              canManage={canManage}
            />
          ))}
        </div>
      </Dialog>
    </>
  );
}
