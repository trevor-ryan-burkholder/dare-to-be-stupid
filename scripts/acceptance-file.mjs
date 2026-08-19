/**
 * Where the acceptance receipt lives.
 *
 * A one-constant module, and the reason is a cycle: `run-manifest.mjs` must archive the receipt per
 * run, `driver.mjs` writes it, and `driver.mjs` already imports `run-manifest.mjs`. Importing the
 * name from the driver would close that loop. The alternative — restating the filename in the
 * archive list — is the enumeration defect this project has paid for repeatedly, so the name lives
 * in one place that both can read.
 */

/** Driver-owned, and protected by the `.meeseeks/**` rule with no entry of its own. */
export const ACCEPTANCE_FILE = 'acceptance.json';
