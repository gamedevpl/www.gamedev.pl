import type { LegalDocument } from './types.js';
import { CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, OPERATOR_LEGAL_NAME, SERVICE_DOMAIN } from './operator.js';

/**
 * Privacy policy — English translation. The Polish text in `privacy.pl.ts` is the
 * binding one; keep the two in lockstep, section id for section id.
 */
export const privacyEn: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro:
    `This document explains what personal data ${SERVICE_DOMAIN} collects, why, on what legal basis, and how long ` +
    'we keep it. We wrote it to be read — no wall of legalese.',
  sections: [
    {
      id: 'administrator',
      heading: '1. Who the data controller is',
      blocks: [
        {
          kind: 'p',
          text:
            `The controller of your personal data is ${OPERATOR_LEGAL_NAME} — the operator of the ` +
            `${SERVICE_DOMAIN} service (the “Service”). For anything concerning personal data, contact ` +
            `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
        },
        {
          kind: 'p',
          text:
            'We have not appointed a Data Protection Officer — at this scale of processing the law does not require ' +
            'one. Every request goes straight to the address above.',
        },
      ],
    },
    {
      id: 'dane',
      heading: '2. What we process and on what basis',
      blocks: [
        {
          kind: 'p',
          text:
            'The table below is the complete list. If a category is not here, we do not collect it. Legal bases ' +
            'refer to Article 6(1) GDPR.',
        },
        {
          kind: 'table',
          head: ['Data', 'Purpose', 'Legal basis', 'Retention'],
          rows: [
            [
              'Google account data: account identifier, verified email address, name, profile picture',
              'Creating and running your account, attributing your games to you, daily quotas',
              'Art. 6(1)(b) — performance of a contract (the Terms)',
              'Until you delete your account',
            ],
            [
              'Waitlist email address (if you sign up during the closed beta)',
              'Letting you know when access opens up',
              'Art. 6(1)(b) — steps prior to entering a contract',
              'Until the closed beta ends or you withdraw',
            ],
            [
              'Contact form submissions: your name, email address, and the message you type',
              'Reading and replying to your enquiry',
              'Art. 6(1)(f) — our legitimate interest in answering people who write to us, and ' +
                'Art. 6(1)(c) where the message is a legal request we must handle',
              'Up to 24 months after we close the conversation',
            ],
            [
              'Content you create: game description, title, answers to clarifying questions, feedback on a finished ' +
                'game, optional creator name, uploaded sketches and images',
              'Having an AI agent build your game and publishing it',
              'Art. 6(1)(b) — performance of a contract',
              'Indefinitely for published games (they are part of the project record); unpublished submissions — 24 months',
            ],
            [
              'Your reactions to games you play: a thumbs up/down, and any written feedback you leave — each stored ' +
                'with your account identifier so one vote counts once and feedback can be traced if it is abusive',
              'Improving the games and deciding what to fix next; keeping the feedback form usable',
              'Art. 6(1)(f) — our legitimate interest in improving the games and in a safe Service',
              'Until you delete your account',
            ],
            [
              'Which published games you open while signed in (a count and the last time you opened each) — stored ' +
                'with your account so the home page can suggest games for you. This is separate from anonymous ' +
                'gameplay statistics, which are never linked to your account',
              'Personalising the order of games on the home page',
              'Art. 6(1)(f) — our legitimate interest in helping you find games you are likely to enjoy',
              'Until you delete your account',
            ],
            [
              'Your progress in games that keep it (for example a level reached or items unlocked) — stored with ' +
                'your account identifier so the game can hand it back to you on your next visit',
              'Letting you continue a game where you left off',
              'Art. 6(1)(b) — performance of a contract',
              'Until you delete your account, or delete the progress from within the game',
            ],
            [
              'What you build or leave in a game’s shared world (for example a plot you plant or a note you ' +
                'pin) — stored with your account identifier so only you can change or remove it. Other players ' +
                'see what you made, but never who made it: the game is shown a code, not your name or account',
              'Letting players build a shared place together across visits',
              'Art. 6(1)(b) — performance of a contract',
              'Until you delete your account, or remove it from within the game',
            ],
            [
              'While you are playing a game with a shared world, that you are in it and roughly where — a coarse ' +
                'tile position, not a precise location. Held only in memory for about 40 seconds after your last ' +
                'move and never written to any database. Other players see a short code and a tile: never your ' +
                'name, your account, or the code attached to anything you have built there',
              'Letting players see that others are in the same world at the same time',
              'Art. 6(1)(b) — performance of a contract',
              'About 40 seconds after you stop playing. There is nothing kept to delete later',
            ],
            [
              'The moderation outcome for your description (whether it was rejected and why)',
              'Preventing unlawful or harmful content from being created',
              'Art. 6(1)(c) — legal obligation (Digital Services Act), and 6(1)(f) — our legitimate interest in a ' +
                'safe Service',
              '24 months',
            ],
            [
              'Push notification subscription (your browser’s endpoint address and encryption keys)',
              'Telling you when your game is ready',
              'Art. 6(1)(a) — consent (given in your browser’s prompt)',
              'Until you turn notifications off or the subscription expires',
            ],
            [
              'In-app notifications and status emails about your submissions',
              'Keeping you posted on your game’s progress',
              'Art. 6(1)(b) — performance of a contract',
              '12 months',
            ],
            [
              'The player name you type in multiplayer, and controller input from your phone',
              'Making shared-screen play work',
              'Art. 6(1)(b) — performance of a contract',
              'For the life of the room only — we do not store it',
            ],
            [
              'Technical server logs: IP address, browser type, request time',
              'Security, fault diagnosis, abuse prevention',
              'Art. 6(1)(f) — legitimate interest',
              'Up to 90 days',
            ],
          ],
        },
      ],
    },
    {
      id: 'telemetria',
      heading: '3. Gameplay statistics — deliberately not tied to you',
      blocks: [
        {
          kind: 'p',
          text:
            'We collect data about how games behave: that a game was opened, how long a session lasted, whether the ' +
            'game threw an error, whether it froze. This exists solely to improve the quality of the games.',
        },
        {
          kind: 'p',
          text:
            'This is not personal data and cannot be linked back to you, because we built it so that it cannot be: ' +
            'every time a game is opened it gets a random session identifier that lives only in your browser tab’s ' +
            'memory and is never written to a cookie or to device storage. Neither your account identifier nor your ' +
            'IP address reaches the server with it. Two opens of the same game by the same person are two unrelated ' +
            'sessions to us. We measure games, not people.',
        },
        {
          kind: 'p',
          text:
            'Some games can show your device camera behind the play surface. That feed is displayed only in your ' +
            'browser for the session; it is never recorded, never uploaded, and never included in the gameplay ' +
            'statistics above.',
        },
      ],
    },
    {
      id: 'ai',
      heading: '4. Artificial intelligence — what happens to your game description',
      blocks: [
        {
          kind: 'p',
          text: 'The Service runs on AI models, so the text you type is processed by them. Specifically:',
        },
        {
          kind: 'ul',
          items: [
            'Your game description goes through automated moderation (a Google Gemini model), which may reject it.',
            'It is then refined by an AI model, which may ask you clarifying questions.',
            'An accepted description is handed as a task to a coding agent (GitHub Copilot), which writes the game’s ' +
              'code in our private repository. The games repository is not public — submitting a description does ' +
              'not by itself make it publicly visible.',
            'A published game is visible to all users of the Service, together with its title and — if you supplied ' +
              'one — your creator name.',
          ],
        },
        {
          kind: 'p',
          text:
            'We do not use your content to train our own AI models, and we do not hand it to model providers for ' +
            'training theirs — we use these services in a configuration that does not do that.',
        },
        {
          kind: 'p',
          text:
            'Automated moderation can reject your description without a human involved. This is not a decision ' +
            'producing legal effects within the meaning of Article 22 GDPR — you can simply rewrite and try again. ' +
            `If you believe a rejection was wrong, write to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) and a human ` +
            'will look at it.',
        },
      ],
    },
    {
      id: 'odbiorcy',
      heading: '5. Who we share data with',
      blocks: [
        {
          kind: 'p',
          text:
            'We do not sell data and do not share it for marketing. We do rely on providers that process data on ' +
            'our behalf:',
        },
        {
          kind: 'table',
          head: ['Provider', 'Role', 'Where'],
          rows: [
            ['Google Cloud Platform', 'Application hosting and database', 'European Union (europe-west1, Belgium)'],
            ['Google (Sign in with Google)', 'Authentication', 'USA — Data Privacy Framework'],
            [
              'Google Cloud Vertex AI (Gemini)',
              'Moderating and refining your game description',
              'USA / global — Standard Contractual Clauses',
            ],
            ['GitHub (Microsoft)', 'Games repository and coding agent', 'USA — Data Privacy Framework'],
            ['Resend', 'Sending email', 'USA — Standard Contractual Clauses'],
            [
              'Google / Apple / Mozilla',
              'Delivering push notifications to your browser (only if you enable them)',
              'USA / EU',
            ],
          ],
        },
        {
          kind: 'p',
          text:
            'Some providers are outside the European Economic Area. Transfers to them rely on a European Commission ' +
            'adequacy decision (the EU–US Data Privacy Framework) or on Standard Contractual Clauses approved by ' +
            'the European Commission.',
        },
        {
          kind: 'p',
          text: 'We may also disclose data to public authorities where they lawfully require it.',
        },
      ],
    },
    {
      id: 'cookies',
      heading: '6. Cookies and browser storage',
      blocks: [
        {
          kind: 'p',
          text:
            'The Service uses no analytics, marketing or profiling cookies. We do not use Google Analytics or any ' +
            'other third-party tracker. That is why you never see a cookie consent banner here — there is nothing ' +
            'to consent to.',
        },
        { kind: 'p', text: 'We use only what the Service needs to work:' },
        {
          kind: 'ul',
          items: [
            'one session cookie, set after you sign in, which keeps you signed in;',
            'browser local storage, holding your chosen interface language and the list of your submissions so you ' +
              'can return to them on this device.',
          ],
        },
        {
          kind: 'p',
          text:
            'Under Article 399 of the Polish Electronic Communications Law, access to information strictly necessary ' +
            'to provide a service the user requested does not require consent. Local storage data is never sent to ' +
            'our server — you can clear it at any time by clearing site data in your browser.',
        },
      ],
    },
    {
      id: 'prawa',
      heading: '7. Your rights',
      blocks: [
        { kind: 'p', text: 'In relation to your data you have the right to:' },
        {
          kind: 'ul',
          items: [
            'access your data and receive a copy of it (Art. 15 GDPR);',
            'have inaccurate data corrected (Art. 16 GDPR);',
            'have your data erased — the “right to be forgotten” (Art. 17 GDPR);',
            'restrict processing (Art. 18 GDPR);',
            'data portability in a machine-readable format (Art. 20 GDPR);',
            'object to processing based on our legitimate interest (Art. 21 GDPR);',
            'withdraw consent at any time — this applies to push notifications; withdrawal does not affect the ' +
              'lawfulness of processing before it.',
          ],
        },
        {
          kind: 'p',
          text:
            `To exercise any of these, write to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). We respond without undue ` +
            'delay and within one month of receiving your request at the latest.',
        },
        {
          kind: 'p',
          text:
            'If you believe we process your data unlawfully, you have the right to lodge a complaint with the ' +
            'President of the Personal Data Protection Office (UODO), ul. Stawki 2, 00-193 Warsaw, Poland ' +
            '([uodo.gov.pl](https://uodo.gov.pl)).',
        },
      ],
    },
    {
      id: 'usuniecie',
      heading: '8. Deleting your account',
      blocks: [
        {
          kind: 'p',
          text:
            `You can ask us to delete your account at any time by writing to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). ` +
            'We then remove your account data, email address, notification subscriptions, the votes and written ' +
            'feedback you left on games, the record of which games you opened for recommendations, your saved ' +
            'progress in games that keep it, anything you built in a ' +
            'game’s shared world, and the link between your submissions and you. Removing what you built ' +
            'from a shared world also removes it from what other players see there.',
        },
        {
          kind: 'p',
          text:
            'Games already published in the arcade stay available but are no longer linked to your account — other ' +
            'players can keep playing them, and we cannot withdraw code that has become part of the project. If you ' +
            'want a specific game taken down, say so explicitly in your request and we will consider it separately.',
        },
      ],
    },
    {
      id: 'bezpieczenstwo',
      heading: '9. Security',
      blocks: [
        {
          kind: 'p',
          text:
            'Connections to the Service are encrypted (HTTPS). Games run in an isolated browser frame with no access ' +
            'to your session, cookies or data — game code, even if it were malicious, has no route to your account. ' +
            'Server-side data is accessible only to the operator.',
        },
        {
          kind: 'p',
          text:
            'In the event of a personal data breach we will notify the President of UODO within 72 hours and, where ' +
            'the breach poses a high risk to you, notify you as well.',
        },
      ],
    },
    {
      id: 'wiek',
      heading: '10. Age of users',
      blocks: [
        {
          kind: 'p',
          text:
            'The Service is intended for people aged 16 and over. We do not knowingly collect data from anyone ' +
            'younger. If you are a parent or guardian and believe your child has given us their data, write to ' +
            `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) and we will delete it.`,
        },
      ],
    },
    {
      id: 'zmiany',
      heading: '11. Changes to this policy',
      blocks: [
        {
          kind: 'p',
          text:
            'We may update this policy when the Service changes or the law does. We will announce material changes ' +
            'in the Service at least 14 days in advance. The effective date of this version is shown at the top of ' +
            'the page.',
        },
      ],
    },
  ],
};
