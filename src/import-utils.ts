import * as moment from 'moment';
import { HledgerSettings } from './settings';


/**
 * Validates import settings to ensure required folders and formats are set
 */
export function validateImportSettings(settings: HledgerSettings): string | null {
    if (!settings.dailyNotesFolder || !settings.hledgerFolder) {
        return 'Please set both daily notes and Hledger folders in settings';
    }
    
    return null;
}

/**
 * Extracts transaction date from a transaction string based on date format
 */
export function extractTransactionDate(transaction: string, hledgerDateFormat: string): string | null {
    // Create a regex pattern based on the hledger date format
    const datePattern = hledgerDateFormat
        .replace(/[YMD]/g, '\\d') // Replace date format characters with digit matchers
        .replace(/[-/]/g, '\\$&'); // Escape special characters
    const dateRegex = new RegExp(`^(${datePattern})`);
    const match = transaction.match(dateRegex);
    
    return match ? match[1] : null;
}

/**
 * Groups transactions by date and filters by date range
 */
export function groupTransactionsByDate(
    transactions: string[], 
    fromDate: string, 
    toDate: string,
    hledgerDateFormat: string
): Map<string, string[]> {
    const transactionsByDate = new Map<string, string[]>();
    const fromMoment = moment.default(fromDate, hledgerDateFormat);
    const toMoment = moment.default(toDate, hledgerDateFormat);
    
    for (const transaction of transactions) {
        const date = extractTransactionDate(transaction, hledgerDateFormat);
        if (!date) continue;
        
        const momentDate = moment.default(date, hledgerDateFormat);
        
        // Check if the transaction date is within the specified range
        if (momentDate.isBetween(fromMoment, toMoment, 'day', '[]')) {
            if (!transactionsByDate.has(date)) {
                transactionsByDate.set(date, []);
            }
            transactionsByDate.get(date)?.push(transaction);
        }
    }
    
    return transactionsByDate;
}

/**
 * Removes dates from transactions
 */
export function removeTransactionDates(transactions: string[], hledgerDateFormat: string): string[] {
    // Build a regex pattern to match the date at the start of the transaction
    let removalPattern = hledgerDateFormat
        .replace(/YYYY/g, '\\d{4}')
        .replace(/YY/g, '\\d{2}')
        .replace(/MM/g, '\\d{2}')
        .replace(/M/g, '\\d{1,2}')
        .replace(/DD/g, '\\d{2}')
        .replace(/D/g, '\\d{1,2}');
    
    // Escape separators - ensure correct escaping for regex
    removalPattern = removalPattern
        .replace(/\//g, '\\/')
        .replace(/\./g, '\\.')
        .replace(/-/g, '\\-');

    const dateRemovalRegex = new RegExp(`^${removalPattern}\\s*`);
    
    return transactions.map(transaction => {
        const lines = transaction.split('\n');
        return lines.map((line, index) => {
            if (index === 0) {
                // Remove date from first line
                const processedLine = line.replace(dateRemovalRegex, '').trim();
                // If line is empty after removing date, skip it
                return processedLine || null;
            } else {
                // Remove all leading spaces from transaction lines
                return line.trim();
            }
        })
        .filter(line => line !== null) // Remove null lines (empty descriptions)
        .join('\n');
    });
}

/**
 * Processes transactions, optionally removing dates
 */
export function processTransactions(
    transactions: string[], 
    includeDateInTransactions: boolean,
    hledgerDateFormat: string
): string {
    let processedTransactions = transactions;
    
    // If includeDate is false, remove dates and adjust padding
    if (!includeDateInTransactions) {
        processedTransactions = removeTransactionDates(transactions, hledgerDateFormat);
    }
    
    // Filter out empty transactions and join with double newlines
    return processedTransactions
        .filter(t => t.trim())
        .join('\n\n') + '\n';
}

/**
 * Gets target note path for a given date
 */
export async function getTargetNotePath(
    date: string,
    hledgerDateFormat: string,
    dailyNotesDateFormat: string,
    dailyNotesFolder: string,
    adapter: any
): Promise<string> {
    const momentDate = moment.default(date, hledgerDateFormat);
    let targetPath: string;
    
    // Handle folder structure in date format
    if (dailyNotesDateFormat.includes('/')) {
        const [folderFormat, fileFormat] = dailyNotesDateFormat.split('/');
        const subFolder = momentDate.format(folderFormat);
        const fileName = momentDate.format(fileFormat) + '.md';
        const targetFolder = `${dailyNotesFolder}/${subFolder}`;
        
        // Ensure the target folder exists
        await adapter.mkdir(targetFolder);
        targetPath = `${targetFolder}/${fileName}`;
    } else {
        const fileName = momentDate.format(dailyNotesDateFormat) + '.md';
        targetPath = `${dailyNotesFolder}/${fileName}`;
    }
    
    return targetPath;
}

/**
 * Writes transactions to a daily note
 */
export async function writeTransactionsToNote(
    targetPath: string, 
    transactionsContent: string,
    transactionHeader: string,
    adapter: any
): Promise<void> {
    // Check if file exists
    const fileExists = await adapter.exists(targetPath);
    let finalContent: string;
    
    if (fileExists) {
        // Read existing content
        const existingContent = await adapter.read(targetPath);
        
        // Replace or create hledger section
        const hledgerRegex = /```hledger\n([\s\S]*?)```/;
        if (existingContent.match(hledgerRegex)) {
            finalContent = existingContent.replace(hledgerRegex, `\`\`\`hledger\n${transactionsContent}\`\`\``);
        } else {
            finalContent = existingContent.trimEnd() + `\n\n${transactionHeader}\n\n\`\`\`hledger\n${transactionsContent}\`\`\``;
        }
    } else {
        // Create new file with transactions
        finalContent = `${transactionHeader}\n\n\`\`\`hledger\n${transactionsContent}\`\`\``;
    }
    
    // Write the content
    await adapter.write(targetPath, finalContent);
}

/**
 * Process and write transactions to daily notes
 */
export async function processTransactionsToDailyNotes(
    transactionsByDate: Map<string, string[]>,
    settings: any,
    adapter: any
): Promise<void> {
    for (const [date, dateTransactions] of transactionsByDate) {
        const targetPath = await getTargetNotePath(
            date, 
            settings.hledgerDateFormat, 
            settings.dailyNotesDateFormat, 
            settings.dailyNotesFolder,
            adapter
        );
        
        const processedTransactions = processTransactions(
            dateTransactions, 
            settings.includeDateInTransactions,
            settings.hledgerDateFormat
        );
        
        await writeTransactionsToNote(
            targetPath, 
            processedTransactions,
            settings.transactionHeader,
            adapter
        );
    }
}

interface FormatLineInputEntry {
    account: string;
    amount: number;
    currency: string;
}

type FormatLineFunction = (account: string, amount: number, currency: string, config: any, exchangeAmount?: number, exchangeCurrency?: string) => string;

interface TransactionFormattingSettings {
    includeDateInTransactions: boolean;
    hledgerDateFormat: string;
    // Add other relevant settings from HledgerSettings if needed
}

/**
 * Formats a transaction into an hledger string based on input data and settings.
 */
export function formatHledgerTransaction(
    dateObj: moment.Moment,
    description: string,
    entries: FormatLineInputEntry[],
    settings: TransactionFormattingSettings,
    formatConfig: any, // Replace 'any' with actual FormatConfig type if available/imported
    formatLineFn: FormatLineFunction
): string {
    let content = '';

    // 1. Format Header Line (Date + Description)
    if (settings.includeDateInTransactions) {
        content += dateObj.format(settings.hledgerDateFormat) + (description ? ' ' + description : '') + '\n';
    } else if (description) {
        content += description + '\n';
    }

    // 2. Format Posting Lines
    const padding = settings.includeDateInTransactions ? '    ' : '';
    
    // Check if this is an exchange transaction
    const isExchange = entries.length === 2 && 
                      entries[0].currency !== entries[1].currency &&
                      entries[0].amount !== 0 && 
                      entries[1].amount !== 0;

    if (isExchange) {
        // Format exchange transaction
        content += padding + formatLineFn(entries[0].account, entries[0].amount, entries[0].currency, formatConfig) + '\n';
        content += padding + formatLineFn(
            entries[1].account,
            // Ensure the second amount reflects the exchange correctly (often negative)
            entries[0].amount > 0 && entries[1].amount > 0 ? -entries[1].amount : entries[1].amount,
            entries[1].currency,
            formatConfig,
            Math.abs(entries[0].amount), // Use absolute value for exchange amount
            entries[0].currency
        ) + '\n';
    } else {
        // Regular transaction
        entries.forEach(entry => {
            content += padding + formatLineFn(entry.account, entry.amount, entry.currency, formatConfig) + '\n';
        });
    }

    // Trim trailing newline added by the loop/logic
    return content.trimEnd(); 
}

/**
 * Extracts the date from a filename based on a given format.
 */
export function getDateFromFilename(filePath: string, format: string): moment.Moment | null {
    const filename = filePath.split('/').pop() || '';
    const dateString = filename.replace('.md', ''); // Assuming .md extension

    // Use moment's strict parsing
    const date = moment.default(dateString, format, true);
    return date.isValid() ? date : null;
}

/**
 * Extracts the date from the first line of a string based on a given format.
 */
export function extractDateFromLine(line: string, hledgerDateFormat: string): string | null {
    // Attempt to match the date at the beginning of the line
    const dateMatch = line.match(/^(\d{4}[-\/]\d{2}[-\/]\d{2})/); // Basic YYYY-MM-DD or YYYY/MM/DD
    if (dateMatch) {
        const potentialDate = dateMatch[1];
        // Validate the matched string against the expected format
        if (moment.default(potentialDate, hledgerDateFormat, true).isValid()) {
            return potentialDate;
        }
    }
    return null;
}
