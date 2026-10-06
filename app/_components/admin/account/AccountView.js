import ChangePasswordSection from '@/app/_components/admin/ChangePasswordSection';
import StaffAccountForm from '@/app/_components/admin/StaffAccountForm';
import StaffList from '@/app/_components/admin/StaffList';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';

/**
 * Your own login, and - for the owner - everyone else's too, drawn in the new
 * look (docs/UI_CONVENTIONS.md -> "The new look").
 *
 * The top of the page is open to both roles: managing OTHER people's accounts
 * is owner only, but the create-login form already tells staff to change their
 * password once they have signed in, and a password handed over by someone
 * else is not a password.
 *
 * For the owner the two sit side by side once there is room: your own details
 * and the password form are a narrow column of short fields, which left the
 * rest of a normal-width screen empty. Staff logins takes that space. Narrower,
 * it drops back to one column in the order it is written - your own account
 * first, then everyone else's.
 */
export default function AccountView({ profile, isOwner, staff }) {
  const you = (
    <section aria-labelledby="you-heading" className="@container min-w-0">
      <SectionHeader
        id="you-heading"
        icon="account"
        tone="neutral"
        title="You"
        description="How you sign in, and what you may do."
      />
      <div data-card className="panel p-5">
        <dl className="space-y-4">
          <div>
            <dt className="caption">Name</dt>
            <dd className="mt-0.5 text-base font-semibold text-ink-900">{profile.full_name}</dd>
          </div>
          <div>
            <dt className="caption">Email</dt>
            {/* A break allowed after the "@" rather than anywhere: at 16px a
                long address broke off its last letter onto a line of its own. */}
            <dd className="mt-0.5 text-base font-semibold text-ink-900 [overflow-wrap:anywhere]">
              {profile.email ? <EmailAddress email={profile.email} /> : 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="caption">Role</dt>
            <dd className="mt-0.5 text-base font-semibold text-ink-900">
              {isOwner ? 'Owner: full access' : 'Data entry: daily figures only'}
            </dd>
          </div>
        </dl>
        <p className="mt-4 border-t border-ink-200/70 pt-4 text-sm text-ink-700">
          The email and role can only be changed by the owner{isOwner ? ', in Staff logins' : ''}.
        </p>
      </div>

      <div className="mt-4">
        <ChangePasswordSection />
      </div>
    </section>
  );

  return (
    <>
      <TitleHeader
        title="Your account"
        icon="account"
        tone="neutral"
        description="Your own sign-in details. Nobody else can see or change these."
      >
        {/* Owner only, and set up once per person rather than every visit -
            the same reasoning that put adding a bank account behind a dialog. */}
        {isOwner ? <StaffAccountForm /> : null}
      </TitleHeader>

      <div className="@container mt-10">
        {isOwner ? (
          <div className="grid items-start gap-x-8 gap-y-12 @[64rem]:grid-cols-[24rem_1fr]">
            {you}
            <section aria-labelledby="staff-heading" className="@container min-w-0">
              <SectionHeader
                id="staff-heading"
                icon="customers"
                tone="neutral"
                title="Staff logins"
                description="Who can sign in, and what each of them may do."
              />
              <StaffList staff={staff} currentProfileId={profile.id} />
            </section>
          </div>
        ) : (
          <div className="max-w-[30rem]">{you}</div>
        )}
      </div>
    </>
  );
}

/** "name@domain", allowed to break only after the "@" (unless a half will not fit on its own). */
function EmailAddress({ email }) {
  const at = email.indexOf('@');
  if (at < 0) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}
