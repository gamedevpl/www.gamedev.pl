/**
 * Who runs gamedev.pl, in one place.
 *
 * Three separate laws require this to be published and reachable, so it is data
 * rather than prose baked into a document:
 *   - UŚUDE art. 5 — an electronic services provider must publish its identity and
 *     an electronic address;
 *   - GDPR art. 13(1)(a) — the controller's identity and contact details;
 *   - DSA art. 11–12 — a single point of contact for authorities and for users.
 *
 * One address covers all three on purpose: the DSA explicitly allows a single
 * contact point, and a solo operator routing three mailboxes is a way to miss a
 * legal notice, not a way to be more compliant.
 */

/**
 * The operator name published on the site and in both legal documents.
 *
 * "Gamedev.pl" by owner's decision — the owner's personal name is deliberately not
 * published. The documents therefore identify the controller by this name plus a
 * working contact address, and never as a named individual.
 *
 * ⚠️ Known, accepted gap: UŚUDE art. 5(2) requires an electronic services provider to
 * publish their *legal* identity (a natural person's name and address, or a company's
 * name, seat and address), and GDPR art. 13(1)(a) requires the controller's identity.
 * A service name plus an email does not fully satisfy either. Registering a business
 * (JDG or company) and publishing that entity's name and address here closes both gaps
 * without exposing a private individual. Until then, staying in closed beta keeps the
 * exposure small.
 */
export const OPERATOR_LEGAL_NAME = 'Gamedev.pl';

/**
 * The published contact address. Everything legal arrives here: GDPR requests,
 * DSA notices about illegal content, complaints (reklamacje), authority contact.
 *
 * This mailbox must keep *receiving* mail for as long as the documents are published
 * — the domain's other addresses only send (Resend, from `noreply@mail.gamedev.pl`).
 * A published contact address that bounces is worse than none: it is a standing
 * promise to accept legal notices that silently drops them. If this address is ever
 * retired, change it here before the mailbox goes away, not after.
 */
export const CONTACT_EMAIL = 'admin@gamedev.pl';

/**
 * Registered address of the operator.
 *
 * UŚUDE art. 5(2) requires a natural person providing electronic services to give
 * their address alongside their name. Left empty until the operator decides what to
 * publish — a home address on a public site is a real personal-safety trade-off, and
 * a registered business address (JDG) or a virtual office solves it. Every surface
 * that renders this omits the line when it is empty rather than printing a
 * placeholder, so the site is never live with "TODO" on a legal page. Today both
 * LegalPage and SiteFooter leave these out entirely (empty constants made the
 * conditionals always-false under CodeQL); when a value is published here, add
 * the corresponding line back on those surfaces.
 */
export const OPERATOR_ADDRESS = '';

/** Tax identifier, shown only once the operator registers a business (JDG). */
export const OPERATOR_TAX_ID = '';

/** The service these documents govern. */
export const SERVICE_DOMAIN = 'www.gamedev.pl';
export const SERVICE_URL = 'https://www.gamedev.pl';

/**
 * Date both documents took effect. Bump on any substantive change, and tell users
 * before it takes effect (the terms promise 14 days' notice).
 */
export const LEGAL_EFFECTIVE_DATE = '2026-09-05';
