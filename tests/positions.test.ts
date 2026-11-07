import { needsRenumber, positionBetween, POSITION_STEP } from '../src/utils/positions';
import { addDays, isoDay } from '../src/utils/dates';

describe('board positions', () => {
  it('places a card in an empty column, at either end and between two cards', () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_STEP);
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it('asks for a renumber once the gap is too small to split', () => {
    expect(needsRenumber(1, 2)).toBe(false);
    expect(needsRenumber(1, 1 + 1e-7)).toBe(true);
    expect(needsRenumber(null, 1)).toBe(false);
  });
});

describe('date helpers', () => {
  it('isoDay formats a stored calendar date', () => {
    const day = new Date('2026-11-07T00:00:00.000Z');
    expect(isoDay(day)).toBe('2026-11-07');
    expect(isoDay(addDays(day, 30))).toBe('2026-12-07');
    expect(isoDay(null)).toBeNull();
  });
});
