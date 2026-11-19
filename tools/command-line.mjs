// Reads the command line of a MARAZUL tool: named options only, numbers checked, --help printed,
// and a mistake answered with one clear line and exit code 2 (so that a tool's own exit code 1
// always means "the thing I checked is broken").
import { parseArgs } from 'node:util';

/**
 * Parses process arguments against a table of options.
 * @param {object} spec
 * @param {string} spec.usage The text printed for --help (and pointed to after a mistake).
 * @param {Record<string, { type: 'string' | 'boolean' | 'number' | 'integer', default?: any,
 *   min?: number, max?: number }>} spec.options The options by name, as written after `--`.
 * @param {string[]} [spec.argv] The arguments (default: this process's).
 * @returns {Record<string, any>} The value of every option that was given or has a default;
 *   numbers are converted and range-checked.
 */
export function readCommandLine({ usage, options, argv = process.argv.slice(2) }) {
  const table = { help: { type: 'boolean', short: 'h' } };
  for (const [name, option] of Object.entries(options)) {
    table[name] = { type: option.type === 'boolean' ? 'boolean' : 'string' };
  }

  let given;
  try {
    given = parseArgs({ args: argv, options: table, strict: true, allowPositionals: false }).values;
  } catch (error) {
    failUsage(String(error.message || error));
  }
  if (given.help) {
    console.log(usage.trim());
    process.exit(0);
  }

  const values = {};
  for (const [name, option] of Object.entries(options)) {
    const text = given[name];
    if (text === undefined) {
      if (option.default !== undefined) values[name] = option.default;
      continue;
    }
    if (option.type !== 'number' && option.type !== 'integer') {
      values[name] = text;
      continue;
    }
    const number = Number(text);
    if (text.trim() === '' || !Number.isFinite(number)) failUsage(`--${name} needs a number, not "${text}"`);
    if (option.type === 'integer' && !Number.isInteger(number)) failUsage(`--${name} needs a whole number, not "${text}"`);
    if (option.min !== undefined && number < option.min) failUsage(`--${name} must be at least ${option.min}`);
    if (option.max !== undefined && number > option.max) failUsage(`--${name} must be at most ${option.max}`);
    values[name] = number;
  }
  return values;
}

/**
 * Ends the process with a usage mistake: one line on standard error and exit code 2.
 * @param {string} message What is wrong with the command line.
 * @returns {never}
 */
export function failUsage(message) {
  console.error(`${message}\nRun with --help to see the options.`);
  process.exit(2);
}
