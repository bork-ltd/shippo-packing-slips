import { describe, expect, it } from 'vitest';

import { truncateAtSecondPipe } from './truncate-title';

describe('truncateAtSecondPipe', () => {
  it('returns the title unchanged when it has no pipes', () => {
    expect(truncateAtSecondPipe('Storage Container')).toBe('Storage Container');
  });

  it('returns the title unchanged when it has exactly one pipe', () => {
    expect(truncateAtSecondPipe('Storage Container | Blue')).toBe(
      'Storage Container | Blue',
    );
  });

  it('truncates at the second pipe, trimming trailing whitespace', () => {
    expect(
      truncateAtSecondPipe(
        'Battery Tray For Milwaukee Packout | Small Deep Bins | AA AAA AAAA 9V C D',
      ),
    ).toBe('Battery Tray For Milwaukee Packout | Small Deep Bins');
  });

  it('cuts before the second pipe even when a third pipe is present', () => {
    expect(truncateAtSecondPipe('A | B | C | D')).toBe('A | B');
  });

  it('returns an empty string unchanged', () => {
    expect(truncateAtSecondPipe('')).toBe('');
  });
});
