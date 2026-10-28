import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-caption text-text-3">Last updated 28 October 2026</p>
      <p>
        We collect the minimum Hisaab needs to keep score, we do not sell or share your data, and you can export or
        delete it at any time. This policy follows the basics of India&apos;s Digital Personal Data Protection Act, 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your email address, to sign you in.</li>
        <li>Your display name and avatar color.</li>
        <li>Your groups, the nicknames in them, and the game nights you record or view: amounts, who recorded what and when.</li>
        <li>
          Anonymous usage counts (for example &ldquo;a night was started with 5 players&rdquo;). These never include names,
          emails or amounts.
        </li>
      </ul>

      <h2>Why we collect it</h2>
      <p>
        Only to run the app: sign you in, sync nights between phones, show live tables to the people you share them with, and
        show history and stats to members of your groups.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>Members of a group can see that group&apos;s members, nights and stats.</li>
        <li>Anyone with a night&apos;s live-view link can see that night until the link is turned off or expires.</li>
        <li>
          Our service providers store data for us: Supabase (database and sign-in) and Vercel (hosting and anonymous
          analytics). They process it only on our instructions.
        </li>
        <li>We do not sell your data, show ads, or share it with anyone else.</li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>Export: download your data as JSON from the Me tab.</li>
        <li>
          Delete: delete your account from the Me tab. This removes your profile and sign-in and unlinks your name in every
          group. Your friends&apos; game history keeps the nickname so their totals still add up.
        </li>
        <li>Correct: change your display name and color in the Me tab at any time.</li>
      </ul>

      <h2>On your phone</h2>
      <p>
        Hisaab stores your nights on your phone so it works without signal. Signing out clears this local copy.
      </p>

      <h2>Contact</h2>
      <p>A contact address for privacy questions and requests will be published here before public launch.</p>

      <p className="text-caption text-text-3">
        This policy is a working draft and has not yet been reviewed by a lawyer.
      </p>
    </>
  );
}
