import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { LANGUAGES } from '@/app/_lib/guide-content';
import GuideView from '@/app/_components/admin/guide/GuideView';

export const metadata = { title: 'Guide' };

/**
 * How to run the pump on this app: the role check and the language.
 * `GuideView` draws it, in the new look.
 *
 * Open to staff as well as the owner. The person most likely to need it is a
 * new attendant on their first evening, not the man who commissioned the app -
 * so it is a section of its own rather than a paragraph buried in Settings,
 * and it does not hide the owner-only parts, it labels them.
 *
 * LANGUAGE IS A QUERY STRING (`?lang=ur`), the same trick the month filters on
 * Reports and Expenses use. No client component, no cookie, no stored
 * preference: the page renders on the server in one language, and the Urdu
 * version can be sent to someone over WhatsApp as a link that opens in Urdu.
 */
export default async function GuidePage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  const params = await searchParams;
  const lang = LANGUAGES.includes(params?.lang) ? params.lang : 'en';

  return <GuideView lang={lang} />;
}
