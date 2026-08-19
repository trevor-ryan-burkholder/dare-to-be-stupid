/**
 * Who may start a nested run, recorded where a Builder cannot reach it (REVIEW F42).
 *
 * **Both nesting checks trusted facts a Builder controls.** `assertNotNested` read `MEESEEKS_RUNNING`
 * to decide whether it was inside a run and `MEESEEKS_GIVE_THEM_THE_BOX` plus `MEESEEKS_RUN_DEPTH`
 * to decide whether nesting was permitted and how deep. All three are environment variables, and a
 * Builder has unrestricted Bash: it can clear the run marker so a new Driver reads itself as top
 * level, forge the permission it was never given, and reset the depth at every generation. Codex
 * reproduced both. The documented "only the operator's typed flag, to depth two" became prompt
 * discipline around strings anyone in the process tree can rewrite.
 *
 * **So permission stops living in the environment.** A nested run is authorized by a *ticket*: a
 * record the parent Driver writes under its own `.meeseeks/`, naming one child, one depth and one
 * nonce. The environment still carries the nonce — it has to, since that is how a spawned process
 * learns anything — but the nonce alone authorizes nothing. It is a claim to be checked against the
 * record, and the record is what a Builder cannot produce.
 *
 * Four properties, and each answers one of the four verbs F42 uses:
 *
 * - **Cannot mint.** The record lives under `.meeseeks/`, and the guard refuses every write to a
 *   path with a `.meeseeks` segment *at any depth, anywhere* — so a Builder can neither write a
 *   ticket into the real directory nor fabricate a directory of its own to hold one.
 * - **Cannot replay.** Redeeming a ticket consumes it. The second presentation of the same nonce
 *   finds it spent and is refused, so a Builder that reads a nonce out of its own environment —
 *   which it certainly can — gains nothing it can use twice.
 * - **Cannot reset.** Depth is read from the record, never from argv or the environment. A child
 *   cannot declare itself shallower than the ticket its parent wrote.
 * - **Cannot forge absence.** Clearing `MEESEEKS_RUNNING` no longer makes a nested run legal,
 *   because legality now requires a ticket to be *present* rather than a marker to be missing.
 *
 * The ticket is not a secret and does not need to be: it is single-use and bound to a depth. Reading
 * one buys a Builder exactly the run its operator already authorized, once.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Driver-owned, and protected by the `.meeseeks/**` rule with no entry of its own. */
export const NESTING_FILE = 'nesting.json';

/** The environment variable carrying a ticket's nonce to the child that must redeem it. */
export const NESTING_TICKET_ENV = 'MEESEEKS_NESTING_TICKET';

/** Where the child looks for the record: its parent's state directory, named by the parent. */
export const NESTING_AUTHORITY_ENV = 'MEESEEKS_NESTING_AUTHORITY';

/** The store's own schema version, bumped when a field's meaning changes. */
const NESTING_VERSION = 1;

/** @typedef {{ nonce: string, depth: number, issuedAt: string, consumedAt: string | null }} Ticket */

/** Thrown when a nested run cannot prove it was authorized. */
export class NestingAuthorityError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'NestingAuthorityError';
  }
}

/** @param {string} meeseeksDir @returns {string} */
function ticketFile(meeseeksDir) {
  return path.join(meeseeksDir, NESTING_FILE);
}

/**
 * @param {string} meeseeksDir
 * @returns {{ version: number, tickets: Ticket[] }}
 */
function readTickets(meeseeksDir) {
  const file = ticketFile(meeseeksDir);
  if (!existsSync(file)) return { version: NESTING_VERSION, tickets: [] };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // **Unreadable is not permission.** A store nobody can parse cannot authorize anything, and
    // treating it as empty would be the same answer as treating it as forged.
    throw new NestingAuthorityError(
      `${file} could not be read, so no nested run can be authorized from it. Delete it if no run is in progress.`,
    );
  }
  const held = /** @type {{ version?: unknown, tickets?: unknown }} */ (parsed ?? {});
  if (held.version !== NESTING_VERSION || !Array.isArray(held.tickets)) {
    throw new NestingAuthorityError(`${file} is not a nesting authority this build understands.`);
  }
  return { version: NESTING_VERSION, tickets: /** @type {Ticket[]} */ (held.tickets) };
}

/** @param {string} meeseeksDir @param {{ version: number, tickets: Ticket[] }} store */
function writeTickets(meeseeksDir, store) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = ticketFile(meeseeksDir);
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}

/**
 * Issue one ticket for one nested run at one depth.
 *
 * Called only where the operator's flag has already been honoured, by the Driver that is about to
 * spawn a component — never in response to anything a child said.
 *
 * @param {string} meeseeksDir the *parent's* state directory
 * @param {{ depth: number, nonce?: string }} options
 * @returns {Ticket}
 */
export function issueNestingTicket(meeseeksDir, options) {
  if (!Number.isInteger(options.depth) || options.depth < 1) {
    throw new NestingAuthorityError(`a nesting ticket needs the depth it authorizes; got ${JSON.stringify(options.depth)}`);
  }
  const store = readTickets(meeseeksDir);
  /** @type {Ticket} */
  const ticket = {
    nonce: options.nonce ?? randomUUID(),
    depth: options.depth,
    issuedAt: new Date().toISOString(),
    consumedAt: null,
  };
  store.tickets.push(ticket);
  writeTickets(meeseeksDir, store);
  return ticket;
}

/**
 * Redeem a ticket, or refuse and say which of the four ways it failed.
 *
 * Consumption is the anti-replay half and it is written **before** the caller proceeds: a child that
 * redeems and then dies has still spent its ticket, which is the correct direction. A second
 * presentation of the same nonce finds `consumedAt` set.
 *
 * @param {{ authority: string | undefined, nonce: string | undefined, now?: () => string }} presented
 * @returns {{ depth: number }}
 * @throws {NestingAuthorityError}
 */
export function redeemNestingTicket(presented) {
  const now = presented.now ?? (() => new Date().toISOString());
  if (presented.authority === undefined || presented.authority === '' || presented.nonce === undefined || presented.nonce === '') {
    throw new NestingAuthorityError(
      'a nested run must present a nesting ticket issued by the run that started it. Nesting is permitted only by ' +
        'the operator typing --give-them-the-box, and an environment variable is not that permission.',
    );
  }
  const store = readTickets(presented.authority);
  const ticket = store.tickets.find((entry) => entry?.nonce === presented.nonce);
  if (ticket === undefined) {
    throw new NestingAuthorityError(
      'the nesting ticket presented is not one this run issued. A nonce that names no record authorizes nothing.',
    );
  }
  if (ticket.consumedAt !== null) {
    throw new NestingAuthorityError(
      `the nesting ticket presented was already redeemed at ${ticket.consumedAt}. Each authorizes exactly one run.`,
    );
  }
  if (!Number.isInteger(ticket.depth) || ticket.depth < 1) {
    throw new NestingAuthorityError('the nesting ticket records no usable depth, so nothing can be authorized by it.');
  }
  ticket.consumedAt = now();
  writeTickets(presented.authority, store);
  return { depth: ticket.depth };
}

/**
 * A stable, non-secret label for a ticket, for logs and receipts.
 *
 * The nonce itself is single-use rather than confidential, but printing it in full would invite
 * somebody to copy it out of a log and try, and the refusal they would meet is not the lesson worth
 * teaching.
 *
 * @param {string} nonce
 * @returns {string}
 */
export function ticketLabel(nonce) {
  return `ticket:${createHash('sha256').update(nonce).digest('hex').slice(0, 12)}`;
}
