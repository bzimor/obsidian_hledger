import { 
    validateImportSettings,
    groupTransactionsByDate,
    removeTransactionDates,
    processTransactions,
    formatHledgerTransaction,
    extractDateFromLine
} from '../../src/handlers/import-handler';
import { FormatConfig } from '../../src/utils';
import { HledgerSettings } from '../../src/settings';
import { moment } from 'obsidian';

// Mock the DataAdapter and formatLine function
const mockAdapter = {
    exists: jest.fn(),
    read: jest.fn(),
    write: jest.fn()
};

const mockFormatLine = jest.fn((account, amount, currency, config) => 
    `${account}    ${currency} ${amount.toFixed(2)}`);

describe('Import settings validation', () => {
    test('returns null when all required settings are provided', () => {
        const settings: Partial<HledgerSettings> = {
            dailyNotesFolder: 'notes',
            hledgerFolder: 'hledger'
        };
        
        expect(validateImportSettings(settings as HledgerSettings)).toBeNull();
    });

    test('returns error when folders are missing', () => {
        const settings1: Partial<HledgerSettings> = {
            dailyNotesFolder: '',
            hledgerFolder: 'hledger'
        };
        
        const settings2: Partial<HledgerSettings> = {
            dailyNotesFolder: 'notes',
            hledgerFolder: ''
        };
        
        expect(validateImportSettings(settings1 as HledgerSettings)).not.toBeNull();
        expect(validateImportSettings(settings2 as HledgerSettings)).not.toBeNull();
    });
});

describe('Transaction date grouping', () => {
    const transactions = [
        `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`,
        
        `2023-01-20 Rent
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`,
        
        `2023-02-01 Utilities
    Expenses:Utilities    $100.00
    Assets:Checking       $-100.00`
    ];

    test('groups transactions by date', () => {
        const grouped = groupTransactionsByDate(
            transactions,
            '2023-01-10',
            '2023-01-25',
            'YYYY-MM-DD'
        );
        
        expect(grouped.size).toBe(2);
        expect(grouped.has('2023-01-15')).toBe(true);
        expect(grouped.has('2023-01-20')).toBe(true);
        expect(grouped.has('2023-02-01')).toBe(false);
        
        const jan15Transactions = grouped.get('2023-01-15') || [];
        expect(jan15Transactions.length).toBe(1);
        expect(jan15Transactions[0]).toContain('Groceries');
    });

    test('handles empty transaction list', () => {
        const grouped = groupTransactionsByDate(
            [],
            '2023-01-10',
            '2023-01-25',
            'YYYY-MM-DD'
        );
        
        expect(grouped.size).toBe(0);
    });

    test('handles transactions without dates', () => {
        const noDateTransactions = [
            `No date transaction
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`
        ];
        
        const grouped = groupTransactionsByDate(
            noDateTransactions,
            '2023-01-10',
            '2023-01-25',
            'YYYY-MM-DD'
        );
        
        expect(grouped.size).toBe(0);
    });

    test('correctly handles inclusive date range', () => {
        const grouped = groupTransactionsByDate(
            transactions,
            '2023-01-15',
            '2023-01-20',
            'YYYY-MM-DD'
        );
        
        expect(grouped.size).toBe(2);
        expect(grouped.has('2023-01-15')).toBe(true);
        expect(grouped.has('2023-01-20')).toBe(true);
    });
});

describe('Transaction date removal', () => {
    test('removes dates from transactions', () => {
        const transactions = [
            `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`,
            
            `2023-01-20 Rent
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`
        ];
        
        const result = removeTransactionDates(transactions, 'YYYY-MM-DD');
        
        expect(result[0]).not.toContain('2023-01-15');
        expect(result[0]).toContain('Groceries');
        expect(result[1]).not.toContain('2023-01-20');
        expect(result[1]).toContain('Rent');
    });

    test('handles transactions without dates', () => {
        const transactions = [
            `Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`
        ];
        
        const result = removeTransactionDates(transactions, 'YYYY-MM-DD');
        
        expect(result[0]).toContain('Groceries');
    });

    test('handles empty first line after date removal', () => {
        const transactions = [
            `2023-01-15
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`
        ];
        
        const result = removeTransactionDates(transactions, 'YYYY-MM-DD');
        
        // The first line should be removed completely since it only contained a date
        expect(result[0]).not.toContain('2023-01-15');
        expect(result[0]).toMatch(/^\s*Expenses:Food/);
    });
});

describe('Transaction processing', () => {
    test('keeps dates when includeDateInTransactions is true', () => {
        const transactions = [
            `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`,
            
            `2023-01-20 Rent
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`
        ];
        
        const result = processTransactions(transactions, true, 'YYYY-MM-DD');
        
        expect(result).toContain('2023-01-15');
        expect(result).toContain('2023-01-20');
    });

    test('removes dates when includeDateInTransactions is false', () => {
        const transactions = [
            `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`,
            
            `2023-01-20 Rent
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`
        ];
        
        const result = processTransactions(transactions, false, 'YYYY-MM-DD');
        
        expect(result).not.toContain('2023-01-15');
        expect(result).not.toContain('2023-01-20');
    });

    test('joins transactions with blank lines and adds final newline', () => {
        const transactions = [
            `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00`,
            
            `2023-01-20 Rent
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`
        ];
        
        const result = processTransactions(transactions, true, 'YYYY-MM-DD');
        
        const parts = result.split('2023-01-20');
        expect(parts[0].trim().endsWith('$-50.00')).toBe(true);
        expect(result.endsWith('\n')).toBe(true);
    });
});

describe('Transaction formatting', () => {
    const formatConfig: FormatConfig = {
        numberFormat: 'comma-dot',
        currencySpacing: true,
        currencyPlacement: 'prepend',
        lineLength: 40
    };

    const settings = {
        includeDateInTransactions: true,
        hledgerDateFormat: 'YYYY-MM-DD'
    };

    test('formats a basic transaction correctly', () => {
        const date = moment('2023-01-15');
        const description = 'Groceries';
        const entries = [
            { account: 'Expenses:Food', amount: 50, currency: '$' },
            { account: 'Assets:Checking', amount: -50, currency: '$' }
        ];
        
        const result = formatHledgerTransaction(
            date,
            description,
            entries,
            settings,
            formatConfig,
            mockFormatLine
        );
        
        expect(result).toContain('2023-01-15 Groceries');
        expect(result).toContain('Expenses:Food');
        expect(result).toContain('Assets:Checking');
        expect(mockFormatLine).toHaveBeenCalledWith('Expenses:Food', 50, '$', formatConfig);
    });

    test('formats an exchange transaction correctly', () => {
        const date = moment('2023-01-15');
        const description = 'Currency Exchange';
        const entries = [
            { account: 'Assets:USD', amount: 100, currency: '$' },
            { account: 'Assets:EUR', amount: 90, currency: '€' }
        ];
        
        const result = formatHledgerTransaction(
            date,
            description,
            entries,
            settings,
            formatConfig,
            mockFormatLine
        );
        
        expect(result).toContain('2023-01-15 Currency Exchange');
        expect(mockFormatLine).toHaveBeenCalledWith('Assets:USD', 100, '$', formatConfig);
        // The second call should include exchange rate information
        expect(mockFormatLine).toHaveBeenCalledWith(
            'Assets:EUR', 
            -90, 
            '€', 
            formatConfig,
            100,
            '$'
        );
    });

    test('does not include date when includeDateInTransactions is false', () => {
        const date = moment('2023-01-15');
        const description = 'Groceries';
        const entries = [
            { account: 'Expenses:Food', amount: 50, currency: '$' },
            { account: 'Assets:Checking', amount: -50, currency: '$' }
        ];
        
        const result = formatHledgerTransaction(
            date,
            description,
            entries,
            { ...settings, includeDateInTransactions: false },
            formatConfig,
            mockFormatLine
        );
        
        expect(result).not.toContain('2023-01-15');
        expect(result).toContain('Groceries');
    });
});

describe('Date extraction from line', () => {
    test('extracts date from line beginning', () => {
        expect(extractDateFromLine('2023-01-15 Groceries', 'YYYY-MM-DD')).toBe('2023-01-15');
        expect(extractDateFromLine('2023/01/15 Rent', 'YYYY/MM/DD')).toBe('2023/01/15');
    });
    
    test('returns null for invalid date format', () => {
        expect(extractDateFromLine('15-01-2023 Groceries', 'YYYY-MM-DD')).toBeNull();
        expect(extractDateFromLine('Not a date', 'YYYY-MM-DD')).toBeNull();
        expect(extractDateFromLine('', 'YYYY-MM-DD')).toBeNull();
    });
    
    test('extracts date only from beginning of line', () => {
        expect(extractDateFromLine('Text before 2023-01-15', 'YYYY-MM-DD')).toBeNull();
    });
}); 