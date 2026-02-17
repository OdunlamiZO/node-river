import { Buffer } from 'buffer';
import crypto from 'crypto';
import { InsertOpts, JobArgs, JobState } from '../types';

/**
 * Converts a bit(8) Buffer to an array of JobState values using the bit order from river_job_state_in_bitmask.
 *
 * @param bitmask - The Buffer representing the job state bitmask.
 * @returns An array of JobState values corresponding to the set bits, or null if the bitmask is null.
 */
export const bitmaskToJobStates = (bitmask: Buffer | null): JobState[] | null => {
  if (!bitmask || bitmask.length === 0) return null;
  // Bit order: 7=available, 6=cancelled, 5=completed, 4=discarded, 3=pending, 2=retryable, 1=running, 0=scheduled
  const allStates: JobState[] = [
    JobState.Available, // 7
    JobState.Cancelled, // 6
    JobState.Completed, // 5
    JobState.Discarded, // 4
    JobState.Pending, // 3
    JobState.Retryable, // 2
    JobState.Running, // 1
    JobState.Scheduled, // 0
  ];
  const byte = bitmask[0];
  // Map bits 7..0 to allStates
  return allStates.filter((_, i) => (byte & (1 << (7 - i))) !== 0);
};

/**
 * Maps job args and unique options to a unique key buffer.
 *
 * @param args - The job arguments to use for uniqueness computation.
 * @param opts - The insertion options, including unique options.
 * @returns A Buffer containing the unique key, or undefined if no unique options are set.
 */
export const mapToUniqueKey = (args: JobArgs, opts: InsertOpts): Buffer | undefined => {
  const uniqueOpts = opts.uniqueOpts;
  if (!uniqueOpts) return undefined;

  const keyParts: Record<string, unknown> = {};

  if (!uniqueOpts.excludeKind) {
    keyParts.kind = args.kind;
  }

  if (uniqueOpts.byArgs === true) {
    keyParts.args = args;
  } else if (Array.isArray(uniqueOpts.byArgs)) {
    keyParts.args = Object.fromEntries(uniqueOpts.byArgs.sort().map((k) => [k, args[k]]));
  }

  if (uniqueOpts.byQueue) {
    keyParts.queue = opts.queue;
  }

  if (uniqueOpts.byPeriod && opts.scheduledAt) {
    const date = new Date(opts.scheduledAt);
    const period = uniqueOpts.byPeriod;
    const timestamp = Math.floor(date.getTime() / 1000);
    const rounded = timestamp - (timestamp % period);
    keyParts.period = rounded;
  }

  const hash = crypto.createHash('sha256').update(JSON.stringify(keyParts)).digest();

  return Buffer.from(hash);
};
