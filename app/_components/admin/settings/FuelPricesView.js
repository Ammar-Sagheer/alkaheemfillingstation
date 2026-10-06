import EmptyState from '@/app/_components/ui/EmptyState';
import Pager from '@/app/_components/ui/Pager';
import FuelPriceTable from '@/app/_components/admin/FuelPriceTable';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';

/**
 * Every rate the pump has ever set, a page at a time, drawn - in the new look
 * (docs/UI_CONVENTIONS.md -> "The new look"). The way back to Settings is the
 * header's back link.
 */
export default function FuelPricesView({ rows, total, page, perPage }) {
  return (
    <>
      <TitleHeader
        title="All fuel rates"
        icon="fuelPump"
        tone="money"
        back={{ href: '/admin/settings', label: 'Back to settings' }}
        description="Every rate that has been set, newest first. Removing one changes what past readings are worth, so it asks first."
      />

      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState
            icon="fuelPump"
            title="No rates set yet"
            description="Set a rate for each fuel under Settings. Readings cannot be entered until one exists."
          />
        ) : (
          <>
            <FuelPriceTable prices={rows} />

            <Pager
              page={page}
              perPage={perPage}
              total={total}
              hrefFor={(n) => `/admin/settings/fuel-prices?page=${n}`}
            />
          </>
        )}
      </div>
    </>
  );
}
