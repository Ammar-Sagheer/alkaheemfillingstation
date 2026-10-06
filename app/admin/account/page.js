import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getProfiles } from '@/app/_lib/data-service';
import AccountView from '@/app/_components/admin/account/AccountView';

export const metadata = { title: 'Your account' };

/**
 * Your own login, and - for the owner - everyone else's: the role check and
 * the query. `AccountView` draws it, in the new look.
 *
 * Staff logins used to live under Settings, which was the wrong page for it -
 * Settings is prices and hardware, this page is already "accounts", and an
 * owner reads their own login details and everyone else's in the same glance
 * far more often than they read the two in different tabs.
 */
export default async function AccountPage() {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  const staff = isOwner ? await getProfiles() : null;

  return <AccountView profile={profile} isOwner={isOwner} staff={staff} />;
}
