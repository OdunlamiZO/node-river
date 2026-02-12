import { Buffer } from 'buffer';
import { JobState } from '../types';

// Converts a bit(8) Buffer to JobState[] using the bit order from river_job_state_in_bitmask
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
