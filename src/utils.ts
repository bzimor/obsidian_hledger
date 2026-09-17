import { DataAdapter, moment } from 'obsidian';

/**
 * Common date-related utility functions and pattern generators
 */

/**
 * Rounds away binary floating-point noise while preserving legitimate decimals.
 * (8 decimal places = satoshi-level precision, more than enough for currency amounts.)
 */
export function roundAmount(value: number, maxDecimals = 8): number {
    if (!Number.isFinite(value)) return value; // keep NaN/Infinity for downstream checks
    return parseFloat(value.toFixed(maxDecimals));
}

/**
 * Inserts a fenced hledger block into a note, under its transaction header.
 *
 * When the note already carries the header as a line of its own, the block is appended
 * to the end of that header's section - the run of lines up to the next markdown heading -
 * rather than to the end of the file, which would file the transactions under whichever
 * section happens to come last. When the header is absent the block is appended at the
 * end of the note, preceded by the header.
 *
 * The header is matched as a whole line, so the text appearing in prose or inside another
 * code block does not count as the section already existing.
 */
export function insertBlockUnderHeader(content: string, header: string, block: string): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const normalizedBlock = block.split('\n').join(eol);
    const trimmedHeader = header.trim();

    if (!trimmedHeader) {
        return content.trimEnd() + `${eol}${eol}${normalizedBlock}`;
    }

    const lines = content.split(/\r?\n/);
    const headerIndex = lines.findIndex(line => line.trim() === trimmedHeader);

    if (headerIndex === -1) {
        return content.trimEnd() + `${eol}${eol}${header}${eol}${eol}${normalizedBlock}`;
    }

    let sectionEnd = lines.length;
    for (let i = headerIndex + 1; i < lines.length; i++) {
        if (/^#{1,6}\s/.test(lines[i])) {
            sectionEnd = i;
            break;
        }
    }

    const before = lines.slice(0, sectionEnd).join(eol).trimEnd();
    const after = lines.slice(sectionEnd).join(eol).trimEnd();

    return after
        ? `${before}${eol}${eol}${normalizedBlock}${eol}${eol}${after}`
        : `${before}${eol}${eol}${normalizedBlock}`;
}

/**
 * Creates a regex pattern for matching dates in hledger format
 */
export function createDateRegexPattern(hledgerDateFormat: string): RegExp {
    let pattern = hledgerDateFormat
        .replace(/YYYY/g, '\\d{4}')
        .replace(/YY/g, '\\d{2}')
        .replace(/MM/g, '\\d{2}')
        .replace(/M/g, '\\d{1,2}')
        .replace(/DD/g, '\\d{2}')
        .replace(/D/g, '\\d{1,2}');
    
    pattern = pattern
        .replace(/\//g, '\\/')
        .replace(/\./g, '\\.')
        .replace(/-/g, '\\-');

    return new RegExp(`^${pattern}`);
}

/**
 * Creates a regex pattern for removing dates from transaction lines
 */
export function createDateRemovalRegex(hledgerDateFormat: string): RegExp {
    const pattern = createDateRegexPattern(hledgerDateFormat).source;
    return new RegExp(`^${pattern.substring(1)}\\s*`);
}

/**
 * Parses hledger journal content into individual transactions
 */
export function parseJournalTransactions(content: string, hledgerDateFormat: string): string[] {
    const transactions: string[] = [];
    let currentTransactionLines: string[] = [];
    
    const dateRegex = createDateRegexPattern(hledgerDateFormat);
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
        if (dateRegex.test(line)) {
            if (currentTransactionLines.length > 0) {
                transactions.push(currentTransactionLines.join('\n'));
            }
            currentTransactionLines = [line];
        } else if (currentTransactionLines.length > 0) {
            if (line.startsWith(' ') || line.startsWith('\t')) {
                 currentTransactionLines.push(line);
            }
        }
    }

    if (currentTransactionLines.length > 0) {
        transactions.push(currentTransactionLines.join('\n'));
    }

    return transactions;
}

/**
 * Extracts date from a transaction string
 */
export function extractTransactionDate(transaction: string, hledgerDateFormat: string): string | null {
    const datePattern = hledgerDateFormat
        .replace(/[YMD]/g, '\\d')
        .replace(/[-/]/g, '\\$&');
    const dateRegex = new RegExp(`^(${datePattern})`);
    const match = transaction.match(dateRegex);
    
    return match ? match[1] : null;
}

/**
 * Gets a date from a filename based on format
 */
export function getDateFromFilename(filePath: string, format: string): moment.Moment | null {
    const filename = filePath.split('/').pop() || '';
    const dateString = filename.replace(/\.md$/i, '');

    const date = moment(dateString, format, true);
    return date.isValid() ? date : null;
}

/**
 * Extracts the hledger block content from a file
 */
export function extractHledgerBlock(fileContent: string): string | null {
    const hledgerCodeBlockRegex = /```hledger\s*([\s\S]*?)```/gi;
    const blocks: string[] = [];
    
    let match;
    while ((match = hledgerCodeBlockRegex.exec(fileContent)) !== null) {
        blocks.push(match[1].trim());
    }
    
    return blocks.length > 0 ? blocks.join('\n\n') : null;
}

/**
 * Normalizes a file path by replacing backslashes with forward slashes
 */
export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
}

/**
 * Ensures that a directory exists, creating it if necessary
 */
export async function ensureDirectoryExists(directoryPath: string, adapter: DataAdapter): Promise<void> {
    if (!directoryPath) return;

    try {
        if (!(await adapter.exists(directoryPath))) {
            try {
                await adapter.mkdir(directoryPath);
            } catch (mkdirError) {
                if (!(await adapter.exists(directoryPath))) {
                    console.error(`Failed to create directory after checking again: ${directoryPath}`, mkdirError);
                    throw new Error(`Failed to create directory ${directoryPath}`);
                }
            }
        }
    } catch (error) {
        console.error(`Error ensuring directory exists ${directoryPath}:`, error);
        if (error instanceof Error && error.message.startsWith('Failed to create directory')) {
            throw error;
        } else {
            throw new Error(`Failed to ensure directory exists ${directoryPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/**
 * Gets the parent directory of a file path
 */
export function getParentDirectory(path: string): string {
    const normalizedPath = normalizePath(path);
    const pathWithoutTrailingSlash = normalizedPath.endsWith('/') 
        ? normalizedPath.slice(0, -1) 
        : normalizedPath;
    const lastSlashIndex = pathWithoutTrailingSlash.lastIndexOf('/');
    
    if (lastSlashIndex === -1) {
        return '';
    }
    
    return pathWithoutTrailingSlash.substring(0, lastSlashIndex);
}

export type NumberFormat = 'comma-dot' | 'space-comma' | 'dot-comma';

export interface FormatConfig {
    numberFormat: NumberFormat;
    currencySpacing: boolean;
    currencyPlacement: 'prepend' | 'append';
    lineLength: number;
} 