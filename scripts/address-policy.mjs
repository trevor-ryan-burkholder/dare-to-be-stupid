/**
 * Which network addresses a Driver-owned fetch may connect to (`DESIGN.md` §3.8.6, item 49).
 *
 * This file exists because *"fetch the source the report cites"* is a server-side request the
 * operator did not write, aimed at a URL a **model chose**, running on the operator's machine
 * inside the operator's network. That is the textbook shape of SSRF, and the interesting targets
 * are not on the public internet: they are `169.254.169.254`, `127.0.0.1:8080`, and whatever the
 * operator's LAN happens to answer on.
 *
 * ## Deny by structure, not by list
 *
 * Every rule below is a CIDR range checked against **raw address bytes**, never against the text
 * of a hostname or a URL. String-level checks are what get bypassed: `127.1`, `0x7f.1`,
 * `2130706433`, `localtest.me`, and `[::ffff:127.0.0.1]` are all loopback and none of them contain
 * the characters `127.0.0.1`. By the time an address reaches {@link addressAllowed} it is bytes,
 * and bytes cannot be spelled creatively.
 *
 * ## The two wrappers that must be unwrapped
 *
 * An IPv6 address can *contain* an IPv4 one. `::ffff:127.0.0.1` is loopback wearing a v6 costume,
 * and `2002:7f00:0001::` is the same trick through 6to4. Both are unwrapped and the embedded v4 is
 * judged by the v4 rules, because a policy that checked only the outer form would pass them.
 *
 * ## Deny-by-default
 *
 * The final rule is that an address family this file does not recognize is **refused**. A future
 * address form arriving into a permissive default is exactly how a policy silently stops being
 * one, and there is no legitimate source document reachable only over something unrecognized.
 */

import net from 'node:net';

/**
 * @typedef {{ allowed: false, reason: string } | { allowed: true }} AddressVerdict
 */

/**
 * IPv4 ranges that are not the public internet, each with the reason it is refused.
 *
 * Written as `[firstByteValues, prefixLength]` pairs is tempting and wrong; they are written as
 * explicit `[bytes, prefix, why]` so a reader can check each one against the RFC that names it.
 *
 * @type {{ base: number[], prefix: number, why: string }[]}
 */
const V4_DENIED = [
  { base: [0, 0, 0, 0], prefix: 8, why: 'this host, on this network (RFC 1122)' },
  { base: [10, 0, 0, 0], prefix: 8, why: 'private (RFC 1918)' },
  { base: [100, 64, 0, 0], prefix: 10, why: 'carrier-grade NAT (RFC 6598)' },
  { base: [127, 0, 0, 0], prefix: 8, why: 'loopback (RFC 1122)' },
  { base: [169, 254, 0, 0], prefix: 16, why: 'link-local, and the cloud metadata endpoint (RFC 3927)' },
  { base: [172, 16, 0, 0], prefix: 12, why: 'private (RFC 1918)' },
  { base: [192, 0, 0, 0], prefix: 24, why: 'IETF protocol assignments (RFC 6890)' },
  { base: [192, 0, 2, 0], prefix: 24, why: 'documentation (RFC 5737)' },
  { base: [192, 88, 99, 0], prefix: 24, why: 'deprecated 6to4 relay anycast (RFC 7526)' },
  { base: [192, 168, 0, 0], prefix: 16, why: 'private (RFC 1918)' },
  { base: [198, 18, 0, 0], prefix: 15, why: 'benchmarking (RFC 2544)' },
  { base: [198, 51, 100, 0], prefix: 24, why: 'documentation (RFC 5737)' },
  { base: [203, 0, 113, 0], prefix: 24, why: 'documentation (RFC 5737)' },
  { base: [224, 0, 0, 0], prefix: 4, why: 'multicast (RFC 5771)' },
  { base: [240, 0, 0, 0], prefix: 4, why: 'reserved, including the broadcast address (RFC 1112)' },
];

/**
 * Parse an IPv4 literal into four bytes.
 *
 * `net.isIPv4` is the gate rather than a hand-written regular expression, because it rejects the
 * shorthand forms (`127.1`, `0x7f.0.0.1`) that a permissive parser would happily accept and then
 * misjudge. Anything it refuses never reaches the byte comparison at all.
 *
 * @param {string} address
 * @returns {number[] | null}
 */
function v4Bytes(address) {
  if (!net.isIPv4(address)) return null;
  return address.split('.').map(Number);
}

/**
 * Expand an IPv6 literal into sixteen bytes.
 *
 * @param {string} address
 * @returns {number[] | null}
 */
function v6Bytes(address) {
  if (!net.isIPv6(address)) return null;
  // A zone index (`fe80::1%eth0`) is not part of the address and would break the split.
  const bare = address.split('%')[0];
  const [head, tail] = bare.includes('::') ? bare.split('::') : [bare, null];

  /** @param {string} group @returns {number[]} */
  const groupBytes = (group) => {
    const value = Number.parseInt(group, 16);
    return [(value >> 8) & 0xff, value & 0xff];
  };

  /** @param {string} part @returns {number[]} */
  const expand = (part) => {
    if (part === '') return [];
    /** @type {number[]} */
    const bytes = [];
    for (const group of part.split(':')) {
      // A trailing IPv4 form: `::ffff:127.0.0.1`. `net.isIPv6` accepts it, so this must too.
      if (group.includes('.')) {
        const embedded = v4Bytes(group);
        if (embedded === null) return [];
        bytes.push(...embedded);
        continue;
      }
      bytes.push(...groupBytes(group));
    }
    return bytes;
  };

  const front = expand(head);
  const back = tail === null ? [] : expand(tail);
  const missing = 16 - front.length - back.length;
  if (missing < 0) return null;
  if (tail === null && missing !== 0) return null;
  return [...front, ...new Array(missing).fill(0), ...back];
}

/**
 * Whether `bytes` falls inside `base/prefix`.
 *
 * @param {number[]} bytes
 * @param {number[]} base
 * @param {number} prefix
 * @returns {boolean}
 */
function inRange(bytes, base, prefix) {
  let remaining = prefix;
  for (let index = 0; index < base.length && remaining > 0; index += 1) {
    const width = Math.min(8, remaining);
    // The top `width` bits of this byte. A mask of 0 would compare nothing, which is why the
    // loop stops at `remaining > 0` rather than running the full length.
    const mask = (0xff << (8 - width)) & 0xff;
    if ((bytes[index] & mask) !== (base[index] & mask)) return false;
    remaining -= width;
  }
  return true;
}

/**
 * Judge one already-resolved address.
 *
 * @param {string} address an IP literal, never a hostname
 * @returns {AddressVerdict}
 */
export function addressAllowed(address) {
  const four = v4Bytes(address);
  if (four !== null) {
    for (const range of V4_DENIED) {
      if (inRange(four, range.base, range.prefix)) {
        return { allowed: false, reason: `${address} is ${range.why}` };
      }
    }
    return { allowed: true };
  }

  const six = v6Bytes(address);
  if (six !== null) {
    // Unwrapped **before** the v6 rules, because the embedded address is the one that decides.
    // `::ffff:127.0.0.1` is loopback and `2002:7f00:0001::` is loopback through 6to4; a policy
    // reading only the outer form passes both.
    const mapped = six.slice(0, 12).every((byte, index) => byte === (index === 10 || index === 11 ? 0xff : 0));
    if (mapped) return addressAllowed(six.slice(12).join('.'));
    if (six[0] === 0x20 && six[1] === 0x02) {
      const embedded = six.slice(2, 6).join('.');
      const verdict = addressAllowed(embedded);
      if (!verdict.allowed) return { allowed: false, reason: `${address} is 6to4 for ${verdict.reason}` };
    }

    /** @type {{ base: number[], prefix: number, why: string }[]} */
    const v6Denied = [
      { base: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 127, why: 'unspecified or loopback (RFC 4291)' },
      { base: [0x01, ...new Array(15).fill(0)], prefix: 8, why: 'discard-only (RFC 6666)' },
      { base: [0x00, 0x64, 0xff, 0x9b, ...new Array(12).fill(0)], prefix: 96, why: 'NAT64, which translates to IPv4 (RFC 6052)' },
      { base: [0x20, 0x01, 0x00, 0x00, ...new Array(12).fill(0)], prefix: 32, why: 'Teredo tunnelling (RFC 4380)' },
      { base: [0x20, 0x01, 0x0d, 0xb8, ...new Array(12).fill(0)], prefix: 32, why: 'documentation (RFC 3849)' },
      { base: [0xfc, ...new Array(15).fill(0)], prefix: 7, why: 'unique local (RFC 4193)' },
      { base: [0xfe, 0x80, ...new Array(14).fill(0)], prefix: 10, why: 'link-local (RFC 4291)' },
      { base: [0xff, ...new Array(15).fill(0)], prefix: 8, why: 'multicast (RFC 4291)' },
    ];
    for (const range of v6Denied) {
      if (inRange(six, range.base, range.prefix)) return { allowed: false, reason: `${address} is ${range.why}` };
    }
    return { allowed: true };
  }

  // Deny by default. Not an IP literal at all, or an address family this policy does not know —
  // and there is no source document reachable only over something unrecognized.
  return { allowed: false, reason: `${JSON.stringify(address)} is not an address this policy recognizes` };
}

/**
 * Judge a whole URL's scheme, port and shape, before any name is resolved.
 *
 * @param {string} url
 * @returns {{ ok: false, reason: string } | { ok: true, target: URL }}
 */
export function urlAllowed(url) {
  /** @type {URL} */
  let target;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, reason: `${JSON.stringify(url)} is not a URL` };
  }
  // HTTPS only. Plain HTTP is refused rather than upgraded: a source captured over a channel
  // anybody on the path could rewrite is not evidence, and silently upgrading would hide that the
  // citation named an unprotected one.
  if (target.protocol !== 'https:') {
    return { ok: false, reason: `${target.protocol}// is refused; source acquisition is HTTPS only` };
  }
  // Credentials in the URL are refused rather than stripped. A URL carrying them is aimed at
  // something authenticated, and quietly fetching the unauthenticated version would capture a
  // different document than the one cited while reporting success.
  if (target.username !== '' || target.password !== '') {
    return { ok: false, reason: 'the URL carries credentials, and an acquired source may not be authenticated' };
  }
  if (target.port !== '' && target.port !== '443') {
    return { ok: false, reason: `port ${target.port} is refused; source acquisition uses the default HTTPS port` };
  }
  // A bare IP literal is judged here as well as at connect time. Reaching resolution at all is
  // avoidable work, and refusing early gives the clearer message.
  const host = target.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) !== 0) {
    const verdict = addressAllowed(host);
    if (!verdict.allowed) return { ok: false, reason: verdict.reason };
  }
  return { ok: true, target };
}
