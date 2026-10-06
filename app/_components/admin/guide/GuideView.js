import { GUIDE } from '@/app/_lib/guide-content';
import Icon from '@/app/_components/ui/Icon';
import Button from '@/app/_components/ui/Button';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import {
  GuideStages,
  GuideSteps,
  GuideSectionMap,
  GuideRoles,
} from '@/app/_components/admin/GuideFlow';

/**
 * How to run the pump on this app, for someone who has never opened it, drawn
 * in the new look (docs/UI_CONVENTIONS.md -> "The new look").
 *
 * `dir` on the article is what turns the whole layout around for Urdu - see
 * GuideFlow.js for why nothing inside may hard-code a left or a right. The
 * shared new-look pieces obey the same rule: TitleHeader indents its line with
 * the logical `ps-`, and SectionHeader is flex and gap only.
 */
export default function GuideView({ lang }) {
  const other = lang === 'en' ? 'ur' : 'en';
  const t = GUIDE[lang];

  return (
    <article dir={t.dir} lang={lang}>
      {/* The switch sits above the title, at the end of the row in both
          languages, so someone who cannot read the one on screen does not
          have to read past the introduction to find the way out of it. */}
      <div className="mb-4 flex justify-end">
        <Button
          variant="secondary"
          href={`/admin/guide?lang=${other}`}
          pending
          aria-label={t.switchAria}
          hrefLang={other}
        >
          <Icon name="guide" className="h-5 w-5" />
          {t.switchLabel}
        </Button>
      </div>

      <TitleHeader title={t.title} description={t.intro} icon="guide" tone="neutral" />

      {/* ================= the three stages ================= */}
      <section aria-labelledby="stages-heading" className="@container mt-10">
        <SectionHeader id="stages-heading" icon="list" tone="neutral" title={t.labels.onThisPage} />
        <GuideStages stages={t.stages} />
      </section>

      <section aria-labelledby="start-heading" className="@container mt-12">
        <SectionHeader id="start-heading" icon="info" tone="neutral" title={t.startHere.heading} />
        <p data-card className="panel px-5 py-4 text-base text-ink-700">
          {t.startHere.body}
        </p>
      </section>

      {/* FOLDED AWAY BY DEFAULT, and the page above already says why: "if the
          pump has already been set up, skip to Every evening". These steps are
          done once, by the owner, and they were a quarter of the height of a
          page whose usual reader is an attendant looking for the evening
          routine. Native <details>, so it opens without JavaScript, is
          findable by the browser's own search, and needs no state. */}
      <section className="@container mt-12">
        <details className="group">
          <summary
            data-card
            className="panel flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4
                       gap-y-3 px-5 py-4 transition hover:bg-ink-50"
          >
            <span className="flex min-w-0 items-start gap-3.5">
              <span className="icon-tile h-11 w-11 bg-ink-200 text-ink-800">
                <Icon name="settings" className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-bold tracking-tight text-ink-900">
                  {t.setup.heading}
                </span>
                <span className="mt-0.5 block text-base text-ink-700">{t.setup.note}</span>
              </span>
            </span>
            {/* Wraps under the heading on a phone, where beside it the words
                squeezed the heading until it clipped. */}
            <span className="flex shrink-0 items-center gap-2 text-base font-semibold text-brand-700">
              {t.labels.showSteps}
              <Icon
                name="chevronRight"
                className="h-5 w-5 rotate-90 transition group-open:-rotate-90"
              />
            </span>
          </summary>

          <div data-card className="panel mt-3 p-5 @[40rem]:p-7">
            <GuideSteps steps={t.setup.steps} labels={t.labels} />
          </div>
        </details>
      </section>

      <section aria-labelledby="daily-heading" className="@container mt-12">
        <SectionHeader
          id="daily-heading"
          icon="readings"
          tone="money"
          title={t.daily.heading}
          description={t.daily.note}
        />
        <div data-card className="panel p-5 @[40rem]:p-7">
          <GuideSteps steps={t.daily.steps} labels={t.labels} />
        </div>
      </section>

      <section aria-labelledby="occasional-heading" className="@container mt-12">
        <SectionHeader
          id="occasional-heading"
          icon="date"
          tone="neutral"
          title={t.occasional.heading}
        />
        <GuideSectionMap items={t.occasional.items} />
      </section>

      <section aria-labelledby="rules-heading" className="@container mt-12">
        <SectionHeader
          id="rules-heading"
          icon="warning"
          tone="neutral"
          title={t.rules.heading}
          description={t.rules.note}
        />
        {/* Each rule leads with the claim in bold and puts the reasoning after
            it, so the whole list can be taken in by reading ten short lines -
            which is how anyone actually reads a page of rules. */}
        <ul data-card className="panel divide-y divide-ink-100 overflow-hidden">
          {t.rules.items.map((rule) => (
            <li key={rule.title} className="flex gap-3 px-5 py-3.5">
              <Icon name="warning" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <span className="text-base text-ink-700">
                <span className="font-bold text-ink-900">{rule.title}</span> {rule.body}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="fixing-heading" className="@container mt-12">
        <SectionHeader id="fixing-heading" icon="pencil" tone="neutral" title={t.fixing.heading} />
        <p data-card className="panel px-5 py-4 text-base text-ink-700">
          {t.fixing.body}
        </p>
      </section>

      <section aria-labelledby="roles-heading" className="@container mt-12">
        <SectionHeader id="roles-heading" icon="customers" tone="neutral" title={t.roles.heading} />
        <GuideRoles roles={t.roles} />
      </section>
    </article>
  );
}
