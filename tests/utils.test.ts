import { 
    createDateRegexPattern,
    createDateRemovalRegex,
    parseJournalTransactions,
    extractTransactionDate,
    getDateFromFilename,
    extractHledgerBlock,
    normalizePath,
    getParentDirectory
} from '../src/utils';
import * as moment from 'moment';

describe('Date regex pattern creation', () => {
    test('createDateRegexPattern creates valid patterns for YYYY-MM-DD format', () => {
        const regex = createDateRegexPattern('YYYY-MM-DD');
        
        expect(regex.test('2023-01-15')).toBe(true);
        expect(regex.test('2023-01-15 Some description')).toBe(true);
        
        expect(regex.test('01-15-2023')).toBe(false);
        expect(regex.test('2023/01/15')).toBe(false);
        expect(regex.test('Some text 2023-01-15')).toBe(false);
    });

    test('createDateRegexPattern creates valid patterns for YYYY/MM/DD format', () => {
        const regex = createDateRegexPattern('YYYY/MM/DD');
        
        expect(regex.test('2023/01/15')).toBe(true);
        expect(regex.test('2023/01/15 Some description')).toBe(true);
        
        expect(regex.test('01/15/2023')).toBe(false);
        expect(regex.test('2023-01-15')).toBe(false);
    });

    test('createDateRegexPattern properly handles different date components', () => {
        const regex = createDateRegexPattern('DD.MM.YYYY');
        
        expect(regex.test('15.01.2023')).toBe(true);
        expect(regex.test('15.01.2023 Some description')).toBe(true);
        
        expect(regex.test('2023.01.15')).toBe(false);
        expect(regex.test('15/01/2023')).toBe(false);
    });
});

describe('Date removal', () => {
    test('createDateRemovalRegex creates pattern that removes date from transaction', () => {
        const regex = createDateRemovalRegex('YYYY-MM-DD');
        
        expect('2023-01-15 Groceries'.replace(regex, '')).toBe('Groceries');
        expect('2023-01-15   Rent payment'.replace(regex, '')).toBe('Rent payment');
        expect('2023-01-15'.replace(regex, '')).toBe('');
    });

    test('createDateRemovalRegex works with different date formats', () => {
        const regex = createDateRemovalRegex('DD/MM/YYYY');
        
        expect('15/01/2023 Groceries'.replace(regex, '')).toBe('Groceries');
        expect('15/01/2023   Car repair'.replace(regex, '')).toBe('Car repair');
    });
});

describe('Journal transaction parsing', () => {
    test('parseJournalTransactions parses simple transactions correctly', () => {
        const content = `2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00
            
2023-01-20 Rent payment
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`;
        
        const transactions = parseJournalTransactions(content, 'YYYY-MM-DD');
        
        expect(transactions).toHaveLength(2);
        expect(transactions[0]).toContain('2023-01-15 Groceries');
        expect(transactions[0]).toContain('Expenses:Food');
        expect(transactions[1]).toContain('2023-01-20 Rent payment');
        expect(transactions[1]).toContain('Expenses:Rent');
    });

    test('parseJournalTransactions ignores non-transaction content', () => {
        const content = `# Comments should be ignored
            
2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00

Some random text here

2023-01-20 Rent payment
    Expenses:Rent      $1000.00
    Assets:Checking    $-1000.00`;
        
        const transactions = parseJournalTransactions(content, 'YYYY-MM-DD');
        
        expect(transactions).toHaveLength(2);
        expect(transactions[0]).not.toContain('Comments should be ignored');
        expect(transactions[1]).not.toContain('Some random text here');
    });

    test('parseJournalTransactions preserves transaction indentation', () => {
        const content = `2023-01-15 Groceries
    Expenses:Food      $50.00
    ; Comment on posting
        ; Indented comment
    Assets:Checking    $-50.00`;
        
        const transactions = parseJournalTransactions(content, 'YYYY-MM-DD');
        
        expect(transactions).toHaveLength(1);
        expect(transactions[0]).toContain('; Comment on posting');
        expect(transactions[0]).toContain('    ; Indented comment');
    });
});

describe('Transaction date extraction', () => {
    test('extractTransactionDate extracts dates in YYYY-MM-DD format', () => {
        const transaction = '2023-01-15 Groceries';
        const date = extractTransactionDate(transaction, 'YYYY-MM-DD');
        
        expect(date).toBe('2023-01-15');
    });

    test('extractTransactionDate extracts dates in various formats', () => {
        expect(extractTransactionDate('15/01/2023 Rent', 'DD/MM/YYYY')).toBe('15/01/2023');
        expect(extractTransactionDate('2023.01.15 Utilities', 'YYYY.MM.DD')).toBe('2023.01.15');
    });

    test('extractTransactionDate returns null for non-matching formats', () => {
        expect(extractTransactionDate('2023-01-15 Groceries', 'DD/MM/YYYY')).toBeNull();
        expect(extractTransactionDate('Not a date', 'YYYY-MM-DD')).toBeNull();
    });
});

describe('Filename date parsing', () => {
    test('getDateFromFilename extracts date from filename with format YYYY-MM-DD', () => {
        const date = getDateFromFilename('2023-10-15.md', 'YYYY-MM-DD');
        
        expect(date).not.toBeNull();
        expect(moment.isMoment(date)).toBe(true);
        if (date) {
            expect(date.format('YYYY-MM-DD')).toBe('2023-10-15');
        }
    });

    test('getDateFromFilename extracts date from filename in various formats', () => {
        const date1 = getDateFromFilename('15.01.2023.md', 'DD.MM.YYYY');
        
        expect(date1).not.toBeNull();
        expect(moment.isMoment(date1)).toBe(true);
        if (date1) {
            expect(date1.format('YYYY-MM-DD')).toBe('2023-01-15');
        }
    });

    test('getDateFromFilename returns null for filename without date', () => {
        const date = getDateFromFilename('filename.md', 'YYYY-MM-DD');
        
        expect(date).toBeNull();
    });

    test('getDateFromFilename returns null for non-matching format', () => {
        const date = getDateFromFilename('2023-01-15.md', 'DD/MM/YYYY');
        
        expect(date).toBeNull();
    });

    test('getDateFromFilename handles paths correctly', () => {
        const date1 = getDateFromFilename('folder/2023-01-15.md', 'YYYY-MM-DD');
        const date2 = getDateFromFilename('folder/subfolder/2023-01-15.md', 'YYYY-MM-DD');
        
        if (date1) {
            expect(date1.format('YYYY-MM-DD')).toBe('2023-01-15');
        } else {
            fail('date1 should not be null');
        }
        
        if (date2) {
            expect(date2.format('YYYY-MM-DD')).toBe('2023-01-15');
        } else {
            fail('date2 should not be null');
        }
    });
});

describe('Hledger block extraction', () => {
    test('extractHledgerBlock extracts content within code blocks', () => {
        const fileContent = `# Daily Note
        
Some text here

## Transactions

\`\`\`hledger
2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00
\`\`\`

More text at the end`;
        
        const hledgerBlock = extractHledgerBlock(fileContent);
        
        expect(hledgerBlock).toContain('2023-01-15 Groceries');
        expect(hledgerBlock).toContain('Expenses:Food');
        expect(hledgerBlock).not.toContain('# Daily Note');
    });

    test('extractHledgerBlock returns null if no block found', () => {
        const fileContent = `# Daily Note
        
No hledger block here
`;
        
        const hledgerBlock = extractHledgerBlock(fileContent);
        
        expect(hledgerBlock).toBeNull();
    });

    test('extractHledgerBlock trims whitespace', () => {
        const fileContent = `\`\`\`hledger

2023-01-15 Groceries
    Expenses:Food      $50.00
    Assets:Checking    $-50.00
    
\`\`\``;
        
        const hledgerBlock = extractHledgerBlock(fileContent);
        
        expect(hledgerBlock).toBe('2023-01-15 Groceries\n    Expenses:Food      $50.00\n    Assets:Checking    $-50.00');
    });
});

describe('Path utilities', () => {
    test('normalizePath replaces backslashes with forward slashes', () => {
        const result1 = normalizePath('path\\to\\file.txt');
        const result2 = normalizePath('C:\\Users\\name\\file.txt');
        const result3 = normalizePath('already/normalized/path');
        
        expect(result1).toBe('path/to/file.txt');
        expect(result2).toBe('C:/Users/name/file.txt');
        expect(result3).toBe('already/normalized/path');
    });

    test('getParentDirectory returns parent directory path', () => {
        const result1 = getParentDirectory('path/to/file.txt');
        const result2 = getParentDirectory('path/to/');
        const result3 = getParentDirectory('file.txt');
        
        expect(result1).toBe('path/to');
        expect(result2).toBe('path');
        expect(result3).toBe('');
    });

    test('getParentDirectory works with normalized paths', () => {
        expect(getParentDirectory('C:/Users/name/file.txt')).toBe('C:/Users/name');
        expect(getParentDirectory('C:\\Users\\name\\file.txt')).toBe('C:/Users/name');
    });
}); 