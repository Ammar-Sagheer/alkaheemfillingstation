'use client';

import { useState, useTransition } from 'react';

import { markAttendance } from '@/app/_lib/actions';
import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';

/**
 * The register for one day (802): every person on the staff list, and three
 * choices beside each. A tap saves at once, the way a register is ticked; there
 * is no Save button to forget at the end of a shift.
 *
 * THE CHOSEN ONE IS FILLED IN ITS OWN COLOUR, and the word stays on it.
 * Present green, half day amber, absent red: a page of thirty rows is checked
 * at a glance for the red ones. The word is there because the colour alone
 * does not survive a dim tablet or a colour-blind reader.
 *
 * Shown at once and saved behind it; if the database refuses (a paid month, a
 * day not yet come) the row goes back and says why.
 */
const CHOICES = [
  { value: 'present', label: 'Present', on: 'bg-brand-700 text-white shadow-sm' },
  { value: 'half', label: 'Half day', on: 'bg-amber-700 text-white shadow-sm' },
  { value: 'absent', label: 'Absent', on: 'bg-red-700 text-white shadow-sm' },
];

const OFF =
  'text-ink-700 hover:bg-white hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export default function AttendanceRegister({ staff, date, initial, disabled = false }) {
  const [marks, setMarks] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState({});
  const [, startTransition] = useTransition();

  function save(ids, status) {
    const before = Object.fromEntries(ids.map((id) => [id, marks[id]]));
    setMarks((current) => {
      const next = { ...current };
      for (const id of ids) {
        if (status === 'clear') delete next[id];
        else next[id] = status;
      }
      return next;
    });
    setSaving((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    setErrors((current) => {
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });

    const formData = new FormData();
    formData.set('work_date', date);
    formData.set('status', status);
    for (const id of ids) formData.append('staff_id', id);

    startTransition(async () => {
      const result = await markAttendance(null, formData);
      setSaving((current) => {
        const next = { ...current };
        for (const id of ids) delete next[id];
        return next;
      });
      if (!result?.ok) {
        setMarks((current) => {
          const next = { ...current };
          for (const id of ids) {
            if (before[id]) next[id] = before[id];
            else delete next[id];
          }
          return next;
        });
        setErrors((current) => ({
          ...current,
          ...Object.fromEntries(ids.map((id) => [id, result?.message ?? 'Could not save.'])),
        }));
      }
    });
  }

  const unmarked = staff.filter((person) => !marks[person.id]).map((person) => person.id);
  const count = (status) => staff.filter((person) => marks[person.id] === status).length;

  return (
    <div data-card className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-3">
        <p className="text-base text-ink-700">
          <span className="tabular font-semibold text-ink-900">
            {staff.length - unmarked.length} of {staff.length}
          </span>{' '}
          marked
          {count('present') ? `, ${count('present')} present` : ''}
          {count('half') ? `, ${count('half')} half day` : ''}
          {count('absent') ? `, ${count('absent')} absent` : ''}
        </p>
        {unmarked.length > 0 && !disabled ? (
          <Button variant="secondary" type="button" onClick={() => save(unmarked, 'present')}>
            <Icon name="check" className="h-4 w-4" />
            Mark the rest present
          </Button>
        ) : null}
      </div>

      <ul className="divide-y divide-ink-100">
        {staff.map((person) => {
          const mark = marks[person.id];
          return (
            <li
              key={person.id}
              className="@container flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink-900">{person.name}</p>
                {person.job ? <p className="truncate text-sm text-ink-600">{person.job}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="seg" role="group" aria-label={`${person.name} on this day`}>
                  {CHOICES.map((choice) => {
                    const isOn = mark === choice.value;
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        disabled={disabled}
                        aria-pressed={isOn}
                        onClick={() => save([person.id], isOn ? 'clear' : choice.value)}
                        className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          isOn ? choice.on : OFF
                        }`}
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
                <span className="w-24 text-sm whitespace-nowrap text-ink-600" aria-live="polite">
                  {saving[person.id] ? 'Saving…' : mark ? '' : 'Not marked'}
                </span>
              </div>
              {errors[person.id] ? (
                <p className="basis-full text-sm font-medium text-red-700" role="alert">
                  {errors[person.id]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
