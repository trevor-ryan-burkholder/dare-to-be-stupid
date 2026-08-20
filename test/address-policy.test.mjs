/**
 * The address policy (`scripts/address-policy.mjs`, PLAN item 49, DESIGN §3.8.6).
 *
 * This is the SSRF boundary. A model chooses the URL; the operator's machine makes the request;
 * the interesting targets are inside the operator's network. So the cases here are the **evasions**
 * rather than the obvious denials — a policy that blocks the literal string `127.0.0.1` and nothing
 * else passes a naive suite while being worth nothing.
 *
 * Every deny case is paired with a benign neighbour in the same range's vicinity, because a policy
 * that refuses everything is not a policy, and `11.0.0.1` being allowed while `10.0.0.1` is not is
 * the assertion that proves the mask arithmetic rather than the intent.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addressAllowed, urlAllowed } from '../scripts/address-policy.mjs';

/** @param {string} address */
const denied = (address) => {
  const verdict = addressAllowed(address);
  assert.equal(verdict.allowed, false, `${address} was allowed`);
  return verdict.allowed === false ? verdict.reason : '';
};
/** @param {string} address */
const allowed = (address) => assert.deepEqual(addressAllowed(address), { allowed: true }, `${address} was denied`);

describe('addressAllowed — IPv4', () => {
  it('denies every private and special range, by the RFC that names it', () => {
    assert.match(denied('10.0.0.1'), /RFC 1918/);
    assert.match(denied('172.16.0.1'), /RFC 1918/);
    assert.match(denied('192.168.1.1'), /RFC 1918/);
    assert.match(denied('127.0.0.1'), /loopback/);
    assert.match(denied('169.254.169.254'), /metadata/);
    assert.match(denied('0.0.0.0'), /this host/);
    assert.match(denied('100.64.0.1'), /carrier-grade NAT/);
    assert.match(denied('224.0.0.1'), /multicast/);
    assert.match(denied('255.255.255.255'), /reserved/);
  });

  it('allows public addresses immediately outside each denied range', () => {
    // The mask arithmetic, not the intent. Each of these is one step outside a range above, and a
    // policy with an off-by-one prefix would refuse them.
    for (const address of ['9.255.255.255', '11.0.0.0', '172.15.255.255', '172.32.0.0', '192.167.255.255', '192.169.0.0', '126.255.255.255', '128.0.0.1', '100.63.255.255', '100.128.0.0', '8.8.8.8', '1.1.1.1']) {
      allowed(address);
    }
  });

  it('refuses the shorthand spellings of loopback rather than misreading them', () => {
    // `127.1`, `0x7f.0.0.1` and `2130706433` are all loopback and none contains the characters
    // `127.0.0.1`. They are not valid IPv4 literals, so they fall to the deny-by-default rule
    // instead of being parsed generously and compared wrongly.
    for (const address of ['127.1', '0x7f.0.0.1', '2130706433', '127.0.1', '017700000001']) {
      assert.match(denied(address), /is not an address this policy recognizes/);
    }
  });

  it('refuses a hostname, because this function judges addresses and never names', () => {
    for (const name of ['localhost', 'metadata.google.internal', 'example.com', '']) {
      assert.match(denied(name), /is not an address this policy recognizes/);
    }
  });
});

describe('addressAllowed — IPv6', () => {
  it('denies loopback, unspecified, unique-local, link-local and multicast', () => {
    assert.match(denied('::1'), /loopback/);
    assert.match(denied('::'), /unspecified/);
    assert.match(denied('fc00::1'), /unique local/);
    assert.match(denied('fd12:3456::1'), /unique local/);
    assert.match(denied('fe80::1'), /link-local/);
    assert.match(denied('fe80::1%eth0'), /link-local/);
    assert.match(denied('ff02::1'), /multicast/);
    assert.match(denied('2001:db8::1'), /documentation/);
  });

  it('allows an ordinary public IPv6 address', () => {
    allowed('2606:4700:4700::1111');
    allowed('2a00:1450:4009:81f::200e');
    // One step outside unique-local: fc00::/7 covers fc and fd, so fe00:: is public.
    allowed('fe00::1');
  });

  it('unwraps an IPv4-mapped address and judges the address inside it', () => {
    // `::ffff:127.0.0.1` is loopback wearing a v6 costume. A policy that read only the outer form
    // would pass it, and this is the single most common bypass of an address allowlist.
    assert.match(denied('::ffff:127.0.0.1'), /loopback/);
    assert.match(denied('::ffff:169.254.169.254'), /metadata/);
    assert.match(denied('::ffff:10.0.0.1'), /RFC 1918/);
    // And the neighbour: a mapped *public* address is still public.
    allowed('::ffff:8.8.8.8');
  });

  it('unwraps 6to4 and judges the IPv4 address encoded in it', () => {
    // 2002:7f00:0001:: encodes 127.0.0.1. The same trick, one layer further out.
    assert.match(denied('2002:7f00:0001::'), /6to4 for .*loopback/);
    assert.match(denied('2002:a9fe:a9fe::'), /6to4 for .*metadata/);
    assert.match(denied('2002:0a00:0001::'), /6to4 for .*RFC 1918/);
    // 2002:0808:0808:: encodes 8.8.8.8, which is public, so the outer form decides and allows.
    allowed('2002:0808:0808::');
  });

  it('denies NAT64 and Teredo, which are IPv4 reachability wearing IPv6', () => {
    assert.match(denied('64:ff9b::7f00:1'), /NAT64/);
    assert.match(denied('2001:0:1234::1'), /Teredo/);
  });
});

describe('urlAllowed', () => {
  it('accepts an ordinary HTTPS URL', () => {
    const verdict = urlAllowed('https://example.org/paper.pdf');
    assert.equal(verdict.ok, true);
    assert.equal(verdict.ok === true && verdict.target.hostname, 'example.org');
  });

  it('refuses every scheme but HTTPS, and does not upgrade', () => {
    // Upgrading would hide that the citation named an unprotected channel. A source anybody on the
    // path could rewrite is not evidence.
    for (const url of ['http://example.org/', 'file:///etc/passwd', 'ftp://example.org/x', 'gopher://example.org/']) {
      const verdict = urlAllowed(url);
      assert.equal(verdict.ok, false, url);
      assert.match(verdict.ok === false ? verdict.reason : '', /HTTPS only/);
    }
  });

  it('refuses credentials in the URL rather than stripping them', () => {
    // Stripping would fetch a *different document* than the one cited and report success.
    const verdict = urlAllowed('https://user:secret@example.org/paper');
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /may not be authenticated/);
    // And the reason must not carry the secret it refused.
    assert.equal((verdict.ok === false ? verdict.reason : '').includes('secret'), false);
  });

  it('refuses a non-default port, which is how an internal service is usually addressed', () => {
    const verdict = urlAllowed('https://example.org:8443/x');
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /port 8443 is refused/);
    // The explicit default port is the same URL and is allowed.
    assert.equal(urlAllowed('https://example.org:443/x').ok, true);
  });

  it('judges a bare IP literal in the host, in both families and in brackets', () => {
    const loopback = urlAllowed('https://127.0.0.1/x');
    assert.equal(loopback.ok, false);
    assert.match(loopback.ok === false ? loopback.reason : '', /loopback/);
    assert.equal(urlAllowed('https://169.254.169.254/latest/meta-data/').ok, false);
    assert.equal(urlAllowed('https://[::1]/x').ok, false);
    assert.equal(urlAllowed('https://[::ffff:127.0.0.1]/x').ok, false);
    // A public literal is allowed, so the rule is about the range and not about literals.
    assert.equal(urlAllowed('https://8.8.8.8/x').ok, true);
  });

  it('refuses text that is not a URL at all', () => {
    for (const url of ['', 'not a url', '//example.org/x', 'https://']) {
      assert.equal(urlAllowed(url).ok, false, url);
    }
  });
});
