import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';

/**
 * The Dashboard on a pump that is not set up yet (Al Hakeem: migration 800).
 * He sets up his own tanks and nozzles, so on the first day there is nothing
 * for the Dashboard to show; this is shown in its place, and the Dashboard
 * proper takes over once there is a tank, a nozzle and a price for every fuel
 * a tank holds.
 *
 * The first three steps are what readings need, in the order they need them.
 * The rest are what the books need before the first day is worth trusting
 * (opening balances, the safe, the bank, staff), offered as links and never
 * blocking: a pump with no credit customers has nothing to do there.
 *
 * `status` is worked out by the page: { tanks, nozzles, missingPrices[] }.
 */
export default function SetupChecklist({ status }) {
  const steps = [
    {
      done: status.tanks > 0,
      title: 'Add your tanks',
      body: 'Each tank in the ground: petrol or diesel, its size, and the fuel in it now from your dip.',
      href: '/admin/settings#tanks-heading',
      action: 'Add tanks',
      count: status.tanks > 0 ? `${status.tanks} ${status.tanks === 1 ? 'tank' : 'tanks'} added` : null,
    },
    {
      done: status.nozzles > 0,
      title: 'Add your nozzles',
      body: 'Each nozzle on the forecourt: its unit, its name, the tank it draws from, and the meter reading off the machine.',
      href: '/admin/settings#units-heading',
      action: 'Add nozzles',
      count:
        status.nozzles > 0 ? `${status.nozzles} ${status.nozzles === 1 ? 'nozzle' : 'nozzles'} added` : null,
    },
    {
      done: status.tanks > 0 && status.missingPrices.length === 0,
      title: 'Set your fuel prices',
      body:
        status.missingPrices.length > 0 && status.tanks > 0
          ? `Still needed: the ${status.missingPrices.join(' and ')} price. Readings use the price set for each day.`
          : 'The selling price per litre for each fuel. Readings use the price set for each day.',
      href: '/admin/settings#prices-heading',
      action: 'Set prices',
    },
  ];

  const extras = [
    {
      title: 'Credit customers',
      body: 'Each customer who buys on credit, with what they owed on your first day.',
      href: '/admin/customers',
    },
    {
      title: 'Cash in the safe',
      body: 'Under Treasury, as "Already in the safe".',
      href: '/admin/treasury',
    },
    { title: 'Bank accounts', body: 'Each account, with its balance on your first day.', href: '/admin/banking' },
    { title: 'Suppliers', body: 'Who you buy fuel and oil from.', href: '/admin/suppliers' },
    { title: 'Staff logins', body: 'A login for each person who will enter readings.', href: '/admin/account' },
  ];

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section aria-labelledby="setup-heading" className="@container mt-8">
      <SectionHeader
        id="setup-heading"
        icon="settings"
        tone="money"
        title="Set up your pump"
        description={`Three steps before the first day's readings. ${doneCount} of 3 done. The Dashboard appears here once they are.`}
      />

      <ol className="grid gap-4 @[48rem]:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            data-card
            className={`panel flex flex-col gap-3 p-5 ${step.done ? 'ring-2 ring-brand-200' : ''}`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`icon-tile h-10 w-10 text-base font-bold ${
                  step.done ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-800'
                }`}
                aria-hidden="true"
              >
                {step.done ? <Icon name="check" className="h-5 w-5" /> : index + 1}
              </span>
              <h3 className="text-lg font-semibold text-ink-900">
                {step.title}
                {step.done ? <span className="sr-only"> (done)</span> : null}
              </h3>
            </div>
            <p className="text-base text-ink-700">{step.body}</p>
            {step.count ? <p className="caption">{step.count}</p> : null}
            <div className="mt-auto">
              <PendingLink
                href={step.href}
                className="inline-flex items-center gap-1 text-base font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                {step.done ? 'Review' : step.action}
                <Icon name="chevronRight" className="h-4 w-4" />
              </PendingLink>
            </div>
          </li>
        ))}
      </ol>

      <h3 className="mb-3 mt-8 text-lg font-semibold text-ink-900">Then, before the first day</h3>
      <ul className="grid gap-3 @[40rem]:grid-cols-2 @[64rem]:grid-cols-3">
        {extras.map((extra) => (
          <li key={extra.title}>
            <PendingLink
              href={extra.href}
              className="panel flex h-full items-start justify-between gap-3 p-4 hover:bg-ink-50"
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold text-ink-900">{extra.title}</span>
                <span className="mt-0.5 block text-sm text-ink-700">{extra.body}</span>
              </span>
              <Icon name="chevronRight" className="mt-1 h-4 w-4 shrink-0 text-ink-500" />
            </PendingLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
