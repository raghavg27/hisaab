import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-caption text-text-3">Last updated 28 October 2026</p>
      <p>
        Hisaab is a scorekeeping app for game nights among friends. By using it you agree to these terms. If you do not
        agree, please do not use Hisaab.
      </p>

      <h2>What Hisaab is, and what it is not</h2>
      <ul>
        <li>Hisaab is a record-keeping tool. It writes down what the people at your table tell it to.</li>
        <li>Hisaab does not host, run or organise any game, and does not decide who wins or loses.</li>
        <li>Hisaab never moves, holds or transfers money. There are no payments, wallets or payment links in the app.</li>
        <li>Hisaab is meant for people who know each other, keeping score together.</li>
      </ul>

      <h2>Who can use it</h2>
      <p>You must be 18 or older to use Hisaab. You confirm this when you create your profile.</p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You are responsible for following the laws that apply where you live and play.</li>
        <li>You are responsible for what you record, and for settling up with your friends outside the app.</li>
        <li>Do not use Hisaab to harass anyone, to impersonate anyone, or to break the law.</li>
        <li>Keep your sign-in email secure. Anyone who can read it can sign in as you.</li>
      </ul>

      <h2>Shared links</h2>
      <p>
        A night&apos;s live-view link lets anyone who has it see that night&apos;s table, log and settlement. Share it only
        with people at the table. The host can turn the link off at any time.
      </p>

      <h2>No warranty</h2>
      <p>
        Hisaab is provided as is. We work hard to keep the numbers right, and every night can be checked against its full
        log, but we cannot promise the app will always be available or error-free. To the extent the law allows, we
        are not liable for losses arising from your use of the app or from disputes between players.
      </p>

      <h2>Ending your use</h2>
      <p>You can delete your account at any time from the Me tab. We may suspend accounts that break these terms.</p>

      <h2>Changes</h2>
      <p>If these terms change in a meaningful way, we will say so in the app before the change takes effect.</p>

      <p className="text-caption text-text-3">
        These terms are a working draft and have not yet been reviewed by a lawyer.
      </p>
    </>
  );
}
