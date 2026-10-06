import LoginForm from '@/app/_components/admin/LoginForm';
import BrandMark from '@/app/_components/ui/BrandMark';
import { WASH } from '@/app/_components/admin/dashboard/tones';
import { BUSINESS_NAME } from '@/app/_lib/brand';

/**
 * There is no signup link, and there never should be. Accounts are created by
 * the owner from Settings.
 *
 * In the new look: a `.panel` in the primary green's wash, the same surface
 * every page header now sits on, so the first screen of the day already looks
 * like the app it opens onto.
 */
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = typeof params?.next === 'string' ? params.next : '';

  return (
    <div data-card className="panel overflow-hidden" style={{ backgroundImage: WASH.money }}>
      <div className="px-6 py-8 sm:px-8">
        {/* Stacked and centred rather than beside the name. A logo big enough
            to be worth showing squeezed "Mubeen Petroleum Service" onto two
            lines beside it; above the name it can be the size it deserves and
            the heading gets the full width back. */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <BrandMark className="h-16" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              {BUSINESS_NAME}
            </h1>
            <p className="mt-1 text-base text-ink-700">Sign in to continue</p>
          </div>
        </div>

        <LoginForm next={next} />
      </div>
    </div>
  );
}
