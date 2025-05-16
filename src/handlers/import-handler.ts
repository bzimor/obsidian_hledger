import { DataAdapter, moment } from 'obsidian';
import { HledgerSettings } from '../settings';
import { 
    extractTransactionDate, 
    createDateRemovalRegex, 
    getDateFromFilename,
    ensureDirectoryExists,
    FormatConfig
} from '../utils';

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
 * Groups transactions by date and filters by date range
 */
export function groupTransactionsByDate(
    transactions: string[], 
    fromDate: string, 
    toDate: string,
    hledgerDateFormat: string
): Map<string, string[]> {
    const transactionsByDate = new Map<string, string[]>();
    const fromMoment = moment(fromDate, hledgerDateFormat);
    const toMoment = moment(toDate, hledgerDateFormat);
    
    for (const transaction of transactions) {
        const date = extractTransactionDate(transaction, hledgerDateFormat);
        if (!date) continue;
        
        const momentDate = moment(date, hledgerDateFormat);
        
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
    const dateRemovalRegex = createDateRemovalRegex(hledgerDateFormat);
    
    return transactions.map(transaction => {
        const lines = transaction.split('\n');
        return lines.map((line, index) => {
            if (index === 0) {
                const processedLine = line.replace(dateRemovalRegex, '').trim();
                return processedLine || null;
            } else {
                return line.trim();
            }
        })
        .filter(line => line !== null)
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
    
    if (!includeDateInTransactions) {
        processedTransactions = removeTransactionDates(transactions, hledgerDateFormat);
    }
    
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
    adapter: DataAdapter
): Promise<string> {
    const momentDate = moment(date, hledgerDateFormat);
    let targetPath: string;
    
    if (dailyNotesDateFormat.includes('/')) {
        const [folderFormat, fileFormat] = dailyNotesDateFormat.split('/');
        const subFolder = momentDate.format(folderFormat);
        const fileName = momentDate.format(fileFormat) + '.md';
        const targetFolder = `${dailyNotesFolder}/${subFolder}`;
        
        await ensureDirectoryExists(targetFolder, adapter);
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
    adapter: DataAdapter
): Promise<void> {
    const fileExists = await adapter.exists(targetPath);
    let finalContent: string;
    
    if (fileExists) {
        const existingContent = await adapter.read(targetPath);
        
        const hledgerRegex = /```hledger\n([\s\S]*?)```/;
        if (existingContent.match(hledgerRegex)) {
            finalContent = existingContent.replace(hledgerRegex, `\`\`\`hledger\n${transactionsContent}\`\`\``);
        } else {
            finalContent = existingContent.trimEnd() + `\n\n${transactionHeader}\n\n\`\`\`hledger\n${transactionsContent}\`\`\``;
        }
    } else {
        finalContent = `${transactionHeader}\n\n\`\`\`hledger\n${transactionsContent}\`\`\``;
    }
    
    await adapter.write(targetPath, finalContent);
}

/**
 * Process and write transactions to daily notes
 */
export async function processTransactionsToDailyNotes(
    transactionsByDate: Map<string, string[]>,
    settings: HledgerSettings,
    adapter: DataAdapter
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

type FormatLineFunction = (account: string, amount: number, currency: string, config: FormatConfig, exchangeAmount?: number, exchangeCurrency?: string) => string;

interface TransactionFormattingSettings {
    includeDateInTransactions: boolean;
    hledgerDateFormat: string;
}

/**
 * Formats a transaction into an hledger string
 */
export function formatHledgerTransaction(
    dateObj: moment.Moment,
    description: string,
    entries: FormatLineInputEntry[],
    settings: TransactionFormattingSettings,
    formatConfig: FormatConfig,
    formatLineFn: FormatLineFunction
): string {
    let content = '';

    if (settings.includeDateInTransactions) {
        content += dateObj.format(settings.hledgerDateFormat) + (description ? ' ' + description : '') + '\n';
    } else if (description) {
        content += description + '\n';
    }

    const padding = settings.includeDateInTransactions ? '    ' : '';
    
    const isExchange = entries.length === 2 && 
                      entries[0].currency !== entries[1].currency &&
                      entries[0].amount !== 0 && 
                      entries[1].amount !== 0;

    if (isExchange) {
        content += padding + formatLineFn(entries[0].account, entries[0].amount, entries[0].currency, formatConfig) + '\n';
        content += padding + formatLineFn(
            entries[1].account,
            entries[0].amount > 0 && entries[1].amount > 0 ? -entries[1].amount : entries[1].amount,
            entries[1].currency,
            formatConfig,
            Math.abs(entries[0].amount),
            entries[0].currency
        ) + '\n';
    } else {
        entries.forEach(entry => {
            content += padding + formatLineFn(entry.account, entry.amount, entry.currency, formatConfig) + '\n';
        });
    }

    return content.trimEnd(); 
}

/**
 * Extracts the date from the first line of a string
 */
export function extractDateFromLine(line: string, hledgerDateFormat: string): string | null {
    const dateMatch = line.match(/^(\d{4}[-\/]\d{2}[-\/]\d{2})/);
    if (dateMatch) {
        const potentialDate = dateMatch[1];
        if (moment(potentialDate, hledgerDateFormat, true).isValid()) {
            return potentialDate;
        }
    }
    return null;
} 