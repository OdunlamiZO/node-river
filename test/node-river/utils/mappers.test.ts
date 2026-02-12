import { Buffer } from 'buffer';
import { JobState } from '../../../src/types';
import { bitmaskToJobStates } from '../../../src/utils';

describe('bitmaskToJobStates', () => {
  it('returns null for null or empty buffer', () => {
    expect(bitmaskToJobStates(null)).toBeNull();
    expect(bitmaskToJobStates(Buffer.from([]))).toBeNull();
  });

  it('returns all states for 0b11111111', () => {
    const result = bitmaskToJobStates(Buffer.from([0b11111111]));
    expect(result).toEqual([
      JobState.Available,
      JobState.Cancelled,
      JobState.Completed,
      JobState.Discarded,
      JobState.Pending,
      JobState.Retryable,
      JobState.Running,
      JobState.Scheduled,
    ]);
  });

  it('returns only Available for 0b10000000', () => {
    const result = bitmaskToJobStates(Buffer.from([0b10000000]));
    expect(result).toEqual([JobState.Available]);
  });

  it('returns only Scheduled for 0b00000001', () => {
    const result = bitmaskToJobStates(Buffer.from([0b00000001]));
    expect(result).toEqual([JobState.Scheduled]);
  });

  it('returns correct states for mixed bits', () => {
    // 0b10101010: Available, Completed, Pending, Running
    const result = bitmaskToJobStates(Buffer.from([0b10101010]));
    expect(result).toEqual([
      JobState.Available,
      JobState.Completed,
      JobState.Pending,
      JobState.Running,
    ]);
  });
});
