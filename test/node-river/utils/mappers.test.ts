import { Buffer } from 'buffer';
import { InsertOpts, JobArgs, JobState } from '../../../src/types';
import { bitmaskToJobStates, mapToUniqueKey } from '../../../src/utils';

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

describe('mapToUniqueKey', () => {
  const baseArgs: JobArgs = {
    kind: 'email',
    userId: 123,
    message: 'Hello',
  };

  it('returns undefined if uniqueOpts is not set', () => {
    const opts: InsertOpts = {};
    expect(mapToUniqueKey(baseArgs, opts)).toBeUndefined();
  });

  it('includes kind by default', () => {
    const opts: InsertOpts = { uniqueOpts: {} };
    const key1 = mapToUniqueKey(baseArgs, opts);
    const key2 = mapToUniqueKey({ ...baseArgs, kind: 'other' }, opts);
    expect(key1).not.toEqual(key2);
  });

  it('excludes kind if excludeKind is true', () => {
    const opts: InsertOpts = { uniqueOpts: { excludeKind: true } };
    const key1 = mapToUniqueKey(baseArgs, opts);
    const key2 = mapToUniqueKey({ ...baseArgs, kind: 'other' }, opts);
    expect(key1).toEqual(key2);
  });

  it('uses all args if byArgs is true', () => {
    const opts: InsertOpts = { uniqueOpts: { byArgs: true } };
    const key1 = mapToUniqueKey(baseArgs, opts);
    const key2 = mapToUniqueKey({ ...baseArgs, userId: 456 }, opts);
    expect(key1).not.toEqual(key2);
  });

  it('uses only specified args if byArgs is an array', () => {
    const opts: InsertOpts = { uniqueOpts: { byArgs: ['userId'] } };
    const key1 = mapToUniqueKey(baseArgs, opts);
    const key2 = mapToUniqueKey({ ...baseArgs, userId: 456 }, opts);
    expect(key1).not.toEqual(key2);

    const key3 = mapToUniqueKey({ ...baseArgs, message: 'Different' }, opts);
    expect(key1).toEqual(key3);
  });

  it('includes queue if byQueue is true', () => {
    const opts: InsertOpts = { uniqueOpts: { byQueue: true }, queue: 'q1' };
    const key1 = mapToUniqueKey(baseArgs, opts);
    const key2 = mapToUniqueKey(baseArgs, { ...opts, queue: 'q2' });
    expect(key1).not.toEqual(key2);
  });

  it('includes period if byPeriod is set', () => {
    const opts = {
      uniqueOpts: { byPeriod: 60 },
      scheduledAt: new Date('2024-01-01T00:01:30Z'),
    };
    const key1 = mapToUniqueKey(baseArgs, opts);

    const opts2 = {
      ...opts,
      scheduledAt: new Date('2024-01-01T00:01:59Z'),
    };
    const key2 = mapToUniqueKey(baseArgs, opts2);

    expect(key1?.toString('hex')).toEqual(key2?.toString('hex'));

    const opts3 = {
      ...opts,
      scheduledAt: new Date('2024-01-01T00:02:00Z'),
    };
    const key3 = mapToUniqueKey(baseArgs, opts3);

    expect(key1?.toString('hex')).not.toEqual(key3?.toString('hex'));
  });
});
