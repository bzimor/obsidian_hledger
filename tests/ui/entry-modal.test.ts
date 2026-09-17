import { canMirrorSecondAmount } from '../../src/ui/entry-modal';

const row = (amount: number, amountEdited = false) => ({
    account: 'Assets:Cash',
    amount,
    currency: '$',
    amountEdited
});

describe('Balancing auto-fill guard', () => {
    test('fills a second row the user has not touched', () => {
        expect(canMirrorSecondAmount([row(100), row(-100)], false)).toBe(true);
        expect(canMirrorSecondAmount(
            [{ account: 'a', amount: 100, currency: '$' }, { account: 'b', amount: 0, currency: '$' }],
            false
        )).toBe(true);
    });

    test('leaves a hand-typed second row alone', () => {
        expect(canMirrorSecondAmount([row(100), row(-30, true)], false)).toBe(false);
    });

    test('never fills in exchange mode or past two rows', () => {
        expect(canMirrorSecondAmount([row(100), row(-100)], true)).toBe(false);
        expect(canMirrorSecondAmount([row(100), row(-100), row(0)], false)).toBe(false);
    });

    test('still protects a hand-typed amount after the row above it is deleted', () => {
        // Row 2 was auto-filled, row 3 typed by hand; deleting row 1 moves the typed
        // amount into position 2, where a positional flag would have stopped guarding it.
        const entries = [row(100), row(-100), row(-30, true)];
        entries.splice(0, 1);

        expect(entries).toHaveLength(2);
        expect(entries[1].amount).toBe(-30);
        expect(canMirrorSecondAmount(entries, false)).toBe(false);
    });

    test('resumes once the user clears the row they typed', () => {
        const entries = [row(100), row(-30, true)];
        entries[1].amountEdited = false;

        expect(canMirrorSecondAmount(entries, false)).toBe(true);
    });
});
