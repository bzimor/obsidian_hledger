import * as moment from 'moment';
import { DataAdapter } from 'obsidian';

/**
 * Common date-related utility functions and pattern generators
 */

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
    return new RegExp(`^${pattern.substring(1)}\\s*`); // Remove ^ from the beginning and add \s*
}

/**
 * Parses hledger journal content into individual transactions
 */
export function parseJournalTransactions(content: string, hledgerDateFormat: string): string[] {
    const transactions: string[] = [];
    let currentTransactionLines: string[] = [];
    
    const dateRegex = createDateRegexPattern(hledgerDateFormat);
    const lines = content.split('\n');

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

    const date = moment.default(dateString, format, true);
    return date.isValid() ? date : null;
}

/**
 * Extracts the hledger block content from a file
 */
export function extractHledgerBlock(fileContent: string): string | null {
    const hledgerCodeBlockRegex = /```hledger\s*([\s\S]*?)\s*```/;
    const match = fileContent.match(hledgerCodeBlockRegex);
    
    if (match && match[1]) {
        return match[1].trim();
    }
    
    return null;
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
    // Remove trailing slash if present before finding the last slash
    const pathWithoutTrailingSlash = normalizedPath.endsWith('/') 
        ? normalizedPath.slice(0, -1) 
        : normalizedPath;
    const lastSlashIndex = pathWithoutTrailingSlash.lastIndexOf('/');
    
    if (lastSlashIndex === -1) {
        return '';
    }
    
    return pathWithoutTrailingSlash.substring(0, lastSlashIndex);
}

// Format types and interfaces used across multiple handlers
export type NumberFormat = 'comma-dot' | 'space-comma' | 'dot-comma';

export interface FormatConfig {
    numberFormat: NumberFormat;
    currencySpacing: boolean;
    currencyPlacement: 'prepend' | 'append';
    lineLength: number;
} 