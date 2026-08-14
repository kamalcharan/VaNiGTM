import { redirect } from 'next/navigation';

/**
 * /gtm/audience has no content of its own — a pathway is its steps. Entering
 * it lands on step 1 rather than showing an empty shell, and the URL then
 * carries the step so breadcrumbs and deep links both work.
 */
export default function AudienceIndex() {
  redirect('/gtm/audience/find');
}
