import { DataAdapter, moment } from 'obsidian';
import { 
    createDateRegexPattern, 
    ensureDirectoryExists, 
    FormatConfig,
    NumberFormat
} from '../utils';

/**
 * Formats a number according to the specified format
 */
export function formatNumber(num: number, format: NumberFormat): string {
    const parts = num.toString().split('.');
    const integerPart = parts[0];
    let decimalPart = parts[1] || '00';
    
    if (decimalPart.length < 2) {
        decimalPart = decimalPart.padEnd(2, '0');
    }
    
    let thousandsSeparator: string;
    let decimalMark: string;
    
    switch (format) {
        case 'comma-dot':
            thousandsSeparator = ',';
            decimalMark = '.';
            break;
        case 'space-comma':
            thousandsSeparator = ' ';
            decimalMark = ',';
            break;
        case 'dot-comma':
            thousandsSeparator = '.';
            decimalMark = ',';
            break;
    }
    
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
    return `${formattedInteger}${decimalMark}${decimalPart}`;
}

/**
 * Formats an amount with its currency according to the specified configuration
 */
export function formatAmount(amount: number, currency: string, config: FormatConfig): string {
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formattedNumber = formatNumber(absAmount, config.numberFormat);
    const space = config.currencySpacing ? ' ' : '';
    
    if (config.currencyPlacement === 'prepend') {
        return isNegative 
            ? `${currency}${space}-${formattedNumber}`
            : `${currency}${space}${formattedNumber}`;
    } else {
        return isNegative
            ? `-${formattedNumber}${space}${currency}`
            : `${formattedNumber}${space}${currency}`;
    }
}

/**
 * Formats a transaction line with proper spacing and alignment
 */
export function formatLine(
    account: string, 
    amount: number, 
    currency: string, 
    config: FormatConfig, 
    exchangeAmount?: number, 
    exchangeCurrency?: string
): string {
    const formattedAmount = formatAmount(amount, currency, config);
    let line = `${account}`;
    
    const paddingLength = config.lineLength - account.length - formattedAmount.length;
    const padding = ' '.repeat(Math.max(0, paddingLength));
    
    if (exchangeAmount !== undefined && exchangeCurrency !== undefined) {
        const formattedExchange = formatAmount(Math.abs(exchangeAmount), exchangeCurrency, config);
        line += `${padding}${formattedAmount} @@ ${formattedExchange}`;
    } else {
        line += `${padding}${formattedAmount}`;
    }
    
    return line;
}

export interface DailyNotePathInfo {
    targetFolder: string;
    targetPath: string;
}

/**
 * Calculates the target folder and file path for a daily note
 */
export function calculateDailyNotePathInfo(
    dateObj: moment.Moment,
    baseFolder: string,
    dateFormat: string
): DailyNotePathInfo {
    let fileName: string;
    let subFolder = '';

    if (dateFormat.includes('/')) {
        const parts = dateFormat.split('/');
        const fileFormat = parts.pop() || '';
        const folderFormat = parts.join('/');
        
        if (folderFormat) {
             subFolder = dateObj.format(folderFormat);
        }
        fileName = dateObj.format(fileFormat) + '.md';
    } else {
        fileName = dateObj.format(dateFormat) + '.md';
    }

    const targetFolder = subFolder 
        ? `${baseFolder}/${subFolder}` 
        : baseFolder;
    
    const cleanedTargetFolder = targetFolder.replace(/\/\//g, '/');
    const targetPath = `${cleanedTargetFolder}/${fileName}`.replace(/\/\//g, '/');

    return { targetFolder: cleanedTargetFolder, targetPath };
}

/**
 * Updates or creates a daily note with a hledger transaction
 */
export async function updateOrCreateDailyNoteHledgerSection(
    targetPath: string,
    transactionContent: string,
    transactionHeader: string,
    adapter: DataAdapter
): Promise<void> {
    try {
        const fileExists = await adapter.exists(targetPath);
        let finalContent: string;

        if (fileExists) {
            const file = await adapter.read(targetPath);
            const hledgerRegex = /```hledger\n([\s\S]*?)```/;
            const match = file.match(hledgerRegex);

            if (match) {
                const existingTransactions = match[1];
                const needsNewline = existingTransactions.length > 0 && 
                                   !existingTransactions.endsWith('\n\n') &&
                                   !existingTransactions.trim().endsWith('\n');
                
                const newContent = needsNewline ? '\n' + transactionContent : transactionContent;
                finalContent = file.replace(hledgerRegex, `\`\`\`hledger\n${match[1]}${newContent}\`\`\``);
            } else {
                finalContent = file.trimEnd() + `\n\n${transactionHeader}\n\n\`\`\`hledger\n${transactionContent.trimEnd()}\n\`\`\``;
            }
        } else {
            finalContent = `${transactionHeader}\n\n\`\`\`hledger\n${transactionContent.trimEnd()}\n\`\`\``;
        }
        
        await adapter.write(targetPath, finalContent);
    } catch (error) {
        console.error(`Error updating or creating daily note section in ${targetPath}:`, error);
        throw new Error(`Failed to update or create hledger section in ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
