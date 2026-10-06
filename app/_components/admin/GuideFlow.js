import Icon from '@/app/_components/ui/Icon';

/**
 * The guide's diagrams.
 *
 * Drawn with boxes, borders and flexbox rather than an image or an SVG chart,
 * for three reasons: it stays sharp and re-flows on the phone the staff
 * actually hold, the text inside it is real text so it can be read aloud or
 * enlarged, and - the deciding one - the same markup renders in Urdu without
 * anything being redrawn.
 *
 * RIGHT-TO-LEFT. Nothing here hard-codes a side. Flex rows follow the `dir`
 * on the page, spacing uses the logical `ms-`/`ps-`/`border-s` utilities
 * rather than left and right, and the one thing that genuinely points - the
 * arrow between stages - is flipped with `rtl:rotate-180`. Put a `left` or an
 * `ml-` in here and the Urdu guide quietly breaks.
 */

/**
 * The whole app as three stages, for the top of the page. Someone who reads
 * only this should still know what the app wants from them and when.
 */
export function GuideStages({ stages }) {
  return (
    // Side by side from 44rem of section, measured against the section rather
    // than the window: beside a pinned sidebar the window overstates the room.
    <ol className="grid gap-3 @[44rem]:grid-cols-[1fr_auto_1fr_auto_1fr] @[44rem]:items-stretch">
      {stages.map((stage, index) => (
        <li key={stage.title} className="contents">
          <div data-card className="panel flex flex-col gap-1 p-5">
            <p className="caption">{stage.when}</p>
            <p className="text-lg font-bold text-ink-900">{stage.title}</p>
            <p className="text-base text-ink-700">{stage.body}</p>
          </div>

          {index < stages.length - 1 ? (
            <div
              aria-hidden="true"
              className="flex items-center justify-center text-ink-500 @[44rem]:px-1"
            >
              {/* Points down when the stages are stacked on a phone, in both
                  languages - a column reads top to bottom in Urdu too, and the
                  old `rtl:-rotate-90` pointed it up. Along the row when they
                  are side by side, and the other way along it in Urdu. */}
              <Icon
                name="chevronRight"
                className="h-6 w-6 rotate-90 @[44rem]:rotate-0 @[44rem]:rtl:rotate-180"
              />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * A numbered run of steps with a line down the side joining them - the
 * "do this, then this" shape, used for the setup and for the evening routine.
 */
export function GuideSteps({ steps, labels }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <li key={step.title} className="flex gap-4">
            {/* The number, and the line to the next one. */}
            <div className="flex flex-col items-center">
              <span
                className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                           bg-brand-600 text-base font-bold text-white"
              >
                {index + 1}
              </span>
              {!isLast ? <span className="w-px flex-1 bg-ink-300" aria-hidden="true" /> : null}
            </div>

            <div className={isLast ? 'pb-0' : 'pb-6'}>
              <h3 className="text-lg font-bold text-ink-900">{step.title}</h3>

              {/* WHERE TO GO, as a chip rather than the first sentence.
                  Every step used to open with "Settings → Tanks." in the same
                  prose as the explanation, so the one piece someone rereads
                  the guide to find - which screen? - was the hardest thing on
                  the page to spot. Lifted out, it carries the nav's own icon,
                  which is the same shape they will be looking for in the
                  sidebar. */}
              {step.where ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-2.5 py-1
                              text-sm font-semibold text-brand-800">
                  <Icon name={step.where.icon} className="h-4 w-4" />
                  {step.where.path}
                </p>
              ) : null}

              <p className="mt-1.5 text-base text-ink-700">{step.body}</p>

              {step.tip ? (
                <p className="callout mt-2">
                  <span className="font-semibold">{labels.tip}</span> {step.tip}
                </p>
              ) : null}

              {step.warn ? (
                <p className="callout-warn mt-2 font-medium">{labels.important}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One card per section of the app, with what it is for and when to open it. */
export function GuideSectionMap({ items }) {
  return (
    <div className="grid gap-4 @[40rem]:grid-cols-2">
      {items.map((item) => (
        <div key={item.name} data-card className="panel flex gap-3.5 p-5">
          {/* The nav's own glyph on the new look's tile, so the card and the
              sidebar entry it describes look like the same place. */}
          <span className="icon-tile h-10 w-10 bg-brand-100 text-brand-700">
            <Icon name={item.icon} className="h-[22px] w-[22px]" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-ink-900">{item.name}</p>
            <p className="mt-0.5 text-base text-ink-700">{item.when}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Who can do what, as a table rather than two lists to compare by eye. */
export function GuideRoles({ roles }) {
  return (
    <div data-card className="panel overflow-hidden">
      <div className="table-scroll mx-0 max-h-none px-0">
        <table className="w-full min-w-[26rem]">
          <thead>
            <tr>
              {/* The logical sides throughout (`ps-`, `pe-`, `text-start`):
                  the Urdu guide runs this table right to left. */}
              <th className="th ps-5 text-start">
                <span className="sr-only">{roles.heading}</span>
              </th>
              <th className="th text-center">{roles.ownerLabel}</th>
              <th className="th pe-5 text-center">{roles.staffLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {roles.rows.map((row) => (
              <tr key={row.label}>
                <td className="td ps-5">{row.label}</td>
                <td className="td text-center">
                  <Allowed yes={row.owner} />
                </td>
                <td className="td pe-5 text-center">
                  <Allowed yes={row.staff} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/*
 * A tick or a cross, two different SHAPES, with the meaning also in the label:
 * a column of green ticks against grey marks told apart by colour alone is
 * exactly the distinction the rest of the app was cleaned of. It was a tick or
 * a dash; the owner asked for no dashes, and a cross says "no" in either
 * language without a word to translate.
 */
function Allowed({ yes }) {
  if (!yes) {
    return (
      <span className="inline-flex text-ink-600" aria-label="No">
        <Icon name="close" className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span className="inline-flex text-brand-700" aria-label="Yes">
      <Icon name="check" className="h-5 w-5" />
    </span>
  );
}
