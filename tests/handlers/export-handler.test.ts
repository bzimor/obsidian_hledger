import { 
    validateExportSettings,
    splitIntoTransactions,
    formatTransaction,
    filterFilesByDateRange,
    writeJournalToFile
} from '../../src/handlers/export-handler';
import { HledgerSettings } from '../../src/settings';
import moment from 'moment';

// Mock the DataAdapter
const mockAdapter = {
    exists: jest.fn(),
    read: jest.fn(),
    write: jest.fn(),
    list: jest.fn(),
    mkdir: jest.fn().mockImplementation(() => Promise.resolve())
};

describe('Export settings validation', () => {
    test('returns null when all required settings are provided', () => {
        const settings: Partial<HledgerSettings> = {
            dailyNotesFolder: 'notes',
            hledgerFolder: 'hledger',
            hledgerDateFormat: 'YYYY-MM-DD',
            dailyNotesDateFormat: 'YYYY-MM-DD'
        };
        
        expect(validateExportSettings(settings as HledgerSettings)).toBeNull();
    });

    test('returns error when folders are missing', () => {
        const settings1: Partial<HledgerSettings> = {
            dailyNotesFolder: '',
            hledgerFolder: 'hledger',
            hledgerDateFormat: 'YYYY-MM-DD',
            dailyNotesDateFormat: 'YYYY-MM-DD'
        };
        
        const settings2: Partial<HledgerSettings> = {
            dailyNotesFolder: 'notes',
            hledgerFolder: '',
            hledgerDateFormat: 'YYYY-MM-DD',
            dailyNotesDateFormat: 'YYYY-MM-DD'
        };
        
        expect(validateExportSettings(settings1 as HledgerSettings)).not.toBeNull();
        expect(validateExportSettings(settings2 as HledgerSettings)).not.toBeNull();
    });

    test('returns error when date formats are missing', () => {
        const settings1: Partial<HledgerSettings> = {
            dailyNotesFolder: 'notes',
            hledgerFolder: 'hledger',
            hledgerDateFormat: '',
            dailyNotesDateFormat: 'YYYY-MM-DD'
        };
        
        const settings2: Partial<HledgerSettings> = {
            dailyNotesFolder: 'notes',
            hledgerFolder: 'hledger',
            hledgerDateFormat: 'YYYY-MM-DD',
            dailyNotesDateFormat: ''
        };
        
        expect(validateExportSettings(settings1 as HledgerSettings)).not.toBeNull();
        expect(validateExportSettings(settings2 as HledgerSettings)).not.toBeNull();
    });
});

describe('Transaction splitting', () => {
    test('splits block content into individual transactions', () => {
        const content = `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00

2023-01-20 Rent
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`;

        const transactions = splitIntoTransactions(content);
        
        expect(transactions).toHaveLength(2);
        expect(transactions[0]).toContain('Groceries');
        expect(transactions[1]).toContain('Rent');
    });

    test('handles empty content', () => {
        expect(splitIntoTransactions('')).toEqual([]);
        expect(splitIntoTransactions(null as any)).toEqual([]);
    });

    test('handles single transaction', () => {
        const content = `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`;

        const transactions = splitIntoTransactions(content);
        
        expect(transactions).toHaveLength(1);
        expect(transactions[0]).toContain('Groceries');
    });

    test('handles multiple blank lines correctly', () => {
        const content = `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00


2023-01-20 Rent
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`;

        const transactions = splitIntoTransactions(content);
        
        expect(transactions).toHaveLength(2);
    });
});

describe('Transaction formatting', () => {
    test('adds date to transaction with description', () => {
        const transaction = `Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`;
        
        const formatted = formatTransaction(transaction, '2023-01-15');
        
        expect(formatted).toContain('2023-01-15 Groceries');
        expect(formatted).toContain('Expenses:Food');
        expect(formatted).toContain('Assets:Checking');
    });

    test('handles transaction already indented', () => {
        const transaction = `    Groceries
        Expenses:Food      $50.00
        Assets:Checking    $-50.00`;
        
        const formatted = formatTransaction(transaction, '2023-01-15');
        
        expect(formatted).toContain('2023-01-15');
        expect(formatted).toContain('Groceries');
        expect(formatted).toContain('Expenses:Food');
        expect(formatted).toContain('Assets:Checking');
    });

    test('maintains proper indentation for postings', () => {
        const transaction = `Groceries
    ; A comment
    Expenses:Food      $50.00
        ; Nested comment
    Assets:Checking    $-50.00`;
        
        const formatted = formatTransaction(transaction, '2023-01-15');
        
        expect(formatted).toContain('; A comment');
        expect(formatted).toContain('; Nested comment');
    });

    test('avoids duplicating date when transaction already has one', () => {
        const transaction = `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`;
        
        const formatted = formatTransaction(transaction, '2023-01-15', 'YYYY-MM-DD');
        
        // Check that the date appears exactly once and not duplicated
        expect(formatted).toContain('2023-01-15 Groceries');
        expect(formatted).toContain('Expenses:Food');
        expect(formatted).toContain('Assets:Checking');
        expect(formatted).not.toContain('2023-01-15 2023-01-15');
    });

    test('normalizes indentation to 4 spaces for transactions with dates', () => {
        const transaction = `2023-01-15 Groceries
        Expenses:Food      $50.00
            Assets:Checking    $-50.00`;
        
        const formatted = formatTransaction(transaction, '2023-01-15', 'YYYY-MM-DD');
        
        // Check that indentation is normalized to exactly 4 spaces
        const lines = formatted.split('\n');
        expect(lines[0]).toBe('2023-01-15 Groceries'); // Header line unchanged
        expect(lines[1]).toBe('    Expenses:Food      $50.00'); // Normalized to 4 spaces
        expect(lines[2]).toBe('    Assets:Checking    $-50.00'); // Normalized to 4 spaces
    });

    test('handles different date formats correctly', () => {
        const transaction = `15/01/2023 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`;
        
        const formatted = formatTransaction(transaction, '2023-01-15', 'DD/MM/YYYY');
        
        // Should preserve the existing date format
        expect(formatted).toContain('15/01/2023 Groceries');
        expect(formatted).toContain('Expenses:Food');
        expect(formatted).toContain('Assets:Checking');
        expect(formatted).not.toContain('2023-01-15');
    });
});

describe('File date filtering', () => {
    test('filters files by date range', () => {
        const files = [
            'notes/2023-01-10.md',
            'notes/2023-01-15.md',
            'notes/2023-01-20.md',
            'notes/2023-01-25.md',
            'notes/2023-02-01.md',
            'notes/other.md'
        ];
        
        const filtered = filterFilesByDateRange(
            files, 
            '2023-01-15', 
            '2023-01-25', 
            'YYYY-MM-DD'
        );
        
        expect(filtered).toHaveLength(3);
        expect(filtered).toContain('notes/2023-01-15.md');
        expect(filtered).toContain('notes/2023-01-20.md');
        expect(filtered).toContain('notes/2023-01-25.md');
        expect(filtered).not.toContain('notes/2023-01-10.md');
        expect(filtered).not.toContain('notes/2023-02-01.md');
        expect(filtered).not.toContain('notes/other.md');
    });

    test('filters with inclusive date range', () => {
        const files = [
            'notes/2023-01-15.md',
            'notes/2023-01-16.md',
            'notes/2023-01-17.md',
        ];
        
        const filtered = filterFilesByDateRange(
            files, 
            '2023-01-15', 
            '2023-01-17', 
            'YYYY-MM-DD'
        );
        
        expect(filtered).toHaveLength(3);
    });

    test('handles non-md files', () => {
        const files = [
            'notes/2023-01-15.md',
            'notes/2023-01-15.txt',
            'notes/2023-01-15'
        ];
        
        const filtered = filterFilesByDateRange(
            files, 
            '2023-01-14', 
            '2023-01-16', 
            'YYYY-MM-DD'
        );
        
        expect(filtered).toHaveLength(1);
        expect(filtered[0]).toBe('notes/2023-01-15.md');
    });

    test('handles different date formats', () => {
        const files = [
            'notes/15.01.2023.md',
            'notes/16.01.2023.md',
            'notes/17.01.2023.md',
        ];
        
        const filtered = filterFilesByDateRange(
            files, 
            '2023-01-15', 
            '2023-01-16', 
            'DD.MM.YYYY'
        );
        
        expect(filtered).toHaveLength(2);
        expect(filtered).toContain('notes/15.01.2023.md');
        expect(filtered).toContain('notes/16.01.2023.md');
    });

    test('handles hierarchical date formats', () => {
        const files = [
            'notes/2023-01/2023-01-15.md',
            'notes/2023-01/2023-01-20.md',
            'notes/2023-02/2023-02-01.md',
            'notes/other/filename.md'
        ];
        
        const filtered = filterFilesByDateRange(
            files, 
            '2023-01-15', 
            '2023-01-31', 
            'YYYY-MM/YYYY-MM-DD'
        );
        
        expect(filtered).toHaveLength(2);
        expect(filtered).toContain('notes/2023-01/2023-01-15.md');
        expect(filtered).toContain('notes/2023-01/2023-01-20.md');
        expect(filtered).not.toContain('notes/2023-02/2023-02-01.md');
        expect(filtered).not.toContain('notes/other/filename.md');
    });
});

describe('Journal file writing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('writes content to file', async () => {
        mockAdapter.exists.mockResolvedValue(false);
        mockAdapter.mkdir.mockResolvedValue(undefined);
        
        await writeJournalToFile(
            'hledger/journal.txt',
            'transaction content',
            mockAdapter as any
        );
        
        expect(mockAdapter.mkdir).toHaveBeenCalled();
        expect(mockAdapter.write).toHaveBeenCalledWith(
            'hledger/journal.txt',
            'transaction content'
        );
    });

    test('creates new file with increment when file exists and replaceExisting is false', async () => {
        // First file exists
        mockAdapter.exists.mockImplementation((path: string) => {
            if (path === 'hledger/journal.txt') {
                return Promise.resolve(true);
            } else if (path === 'hledger/journal_1.txt') {
                return Promise.resolve(true);
            } else if (path === 'hledger/journal_2.txt') {
                return Promise.resolve(false);
            }
            return Promise.resolve(false);
        });
        mockAdapter.mkdir.mockResolvedValue(undefined);
        
        await writeJournalToFile(
            'hledger/journal.txt',
            'new content',
            mockAdapter as any,
            false
        );
        
        // Should write to the incremented file path that doesn't exist yet
        expect(mockAdapter.exists).toHaveBeenCalledWith('hledger/journal.txt');
        expect(mockAdapter.exists).toHaveBeenCalledWith('hledger/journal_1.txt');
        expect(mockAdapter.exists).toHaveBeenCalledWith('hledger/journal_2.txt');
        expect(mockAdapter.write).toHaveBeenCalledWith(
            'hledger/journal_2.txt',
            'new content'
        );
    });

    test('replaces content when replaceExisting is true', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.mkdir.mockResolvedValue(undefined);
        
        await writeJournalToFile(
            'hledger/journal.txt',
            'new content',
            mockAdapter as any,
            true
        );
        
        expect(mockAdapter.exists).toHaveBeenCalledWith('hledger/journal.txt');
        expect(mockAdapter.write).toHaveBeenCalledWith(
            'hledger/journal.txt',
            'new content'
        );
    });
}); 