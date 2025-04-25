import { DataAdapter } from 'obsidian';

export type NumberFormat = 'comma-dot' | 'space-comma' | 'dot-comma';

export interface FormatConfig {
    numberFormat: NumberFormat;
    currencySpacing: boolean;
    currencyPlacement: 'prepend' | 'append';
    lineLength: number;
}

export function formatNumber(num: number, format: NumberFormat): string {
    const parts = num.toString().split('.');
    const integerPart = parts[0];
    let decimalPart = parts[1] || '00';
    
    while (decimalPart.length < 2) {
        decimalPart += '0';
    }
    
    // Format the integer part with thousands separator
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

export function formatAmount(amount: number, currency: string, config: FormatConfig): string {
    const formattedNumber = formatNumber(amount, config.numberFormat);
    const space = config.currencySpacing ? ' ' : '';
    
    if (config.currencyPlacement === 'prepend') {
        return `${currency}${space}${formattedNumber}`;
    } else {
        return `${formattedNumber}${space}${currency}`;
    }
}

export function formatLine(account: string, amount: number, currency: string, config: FormatConfig, exchangeAmount?: number, exchangeCurrency?: string): string {
    const formattedAmount = formatAmount(amount, currency, config);
    let line = `${account}`;
    
    if (exchangeAmount !== undefined && exchangeCurrency !== undefined) {
        // For exchange transactions, first format the line with normal padding
        const paddingLength = config.lineLength - account.length - formattedAmount.length;
        const padding = ' '.repeat(Math.max(0, paddingLength));
        // Then add the exchange amount after the line length
        const formattedExchange = formatAmount(Math.abs(exchangeAmount), exchangeCurrency, config);
        line += `${padding}${formattedAmount} @@ ${formattedExchange}`;
    } else {
        // For regular transactions
        const paddingLength = config.lineLength - account.length - formattedAmount.length;
        const padding = ' '.repeat(Math.max(0, paddingLength));
        line += `${padding}${formattedAmount}`;
    }
    
    return line;
}

export function parseJournalTransactions(content: string, hledgerDateFormat: string): string[] {
    const transactions: string[] = [];
    let currentTransactionLines: string[] = []; // Store lines for the current transaction

    // Generate regex once
    let pattern = hledgerDateFormat;
    // 1. Replace Moment.js tokens with digit patterns
    pattern = pattern
        .replace(/YYYY/g, '\\d{4}')
        .replace(/YY/g, '\\d{2}')
        .replace(/MM/g, '\\d{2}')
        .replace(/M/g, '\\d{1,2}') // Month number 1-12
        .replace(/DD/g, '\\d{2}')
        .replace(/D/g, '\\d{1,2}'); // Day number 1-31
    // 2. Escape common separators
    pattern = pattern
        .replace(/\//g, '\\/') // Escape / -> \/
        .replace(/\./g, '\\.') // Escape . -> \.
        .replace(/-/g, '\\-'); // Escape - -> \-
        
    const dateRegex = new RegExp(`^${pattern}`);

    const lines = content.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (dateRegex.test(line)) { // Use original line for regex test
            // Found the start of a new transaction
            // If we have lines from a previous transaction, join and add them
            if (currentTransactionLines.length > 0) {
                transactions.push(currentTransactionLines.join('\n'));
            }
            // Start the new transaction
            currentTransactionLines = [line]; // Add the date line itself
        } else if (currentTransactionLines.length > 0) {
            // We are inside a transaction (date line already found)
            // Append ONLY indented lines (postings or indented comments)
            if (line.startsWith(' ') || line.startsWith('\t')) {
                 currentTransactionLines.push(line);
            }
            // Ignore non-indented lines (comments, blank lines, other text)
        }
        // If currentTransactionLines is empty and line is not a date, ignore (comments/blanks before first txn)
    }

    // Add the last transaction if it exists
    if (currentTransactionLines.length > 0) {
        transactions.push(currentTransactionLines.join('\n'));
    }

    return transactions;
}

interface DailyNotePathInfo {
    targetFolder: string;
    targetPath: string;
}


/**
 * Calculates the target folder and file path for a daily note based on date and format settings.
 * Handles date formats that include '/' to specify subdirectories.
 */
export function calculateDailyNotePathInfo(
    dateObj: moment.Moment,
    baseFolder: string,
    dateFormat: string
): DailyNotePathInfo {
    let fileName: string;
    let subFolder = '';

    // Check if date format contains folder structure
    if (dateFormat.includes('/')) {
        // Split format into folder part and file part
        const parts = dateFormat.split('/');
        const fileFormat = parts.pop() || ''; // Last part is the file format
        const folderFormat = parts.join('/'); // Remaining parts form the folder format
        
        if (folderFormat) {
             subFolder = dateObj.format(folderFormat);
        }
        fileName = dateObj.format(fileFormat) + '.md';
    } else {
        // Simple date format for the filename
        fileName = dateObj.format(dateFormat) + '.md';
    }

    // Construct the full target folder path
    const targetFolder = subFolder 
        ? `${baseFolder}/${subFolder}` 
        : baseFolder;
    
    // Clean up potential double slashes, just in case
    const cleanedTargetFolder = targetFolder.replace(/\/\//g, '/');
    const targetPath = `${cleanedTargetFolder}/${fileName}`.replace(/\/\//g, '/');

    return { targetFolder: cleanedTargetFolder, targetPath };
}


/**
 * Ensures that a directory exists, creating it if necessary.
 * Handles potential race conditions where the directory might be created between checks.
 * Throws an error if the directory cannot be created.
 */
export async function ensureDirectoryExists(directoryPath: string, adapter: DataAdapter): Promise<void> {
    if (!directoryPath) return; // No directory to create

    try {
        if (!(await adapter.exists(directoryPath))) {
            console.log(`Directory does not exist, attempting to create: ${directoryPath}`);
            try {
                await adapter.mkdir(directoryPath);
                console.log(`Successfully created directory: ${directoryPath}`);
            } catch (mkdirError) {
                // Check again in case of race condition
                if (!(await adapter.exists(directoryPath))) {
                    console.error(`Failed to create directory after checking again: ${directoryPath}`, mkdirError);
                    throw new Error(`Failed to create directory ${directoryPath}`);
                } else {
                    console.log(`Directory found after mkdir error (race condition handled): ${directoryPath}`);
                }
            }
        } else {
            // console.log(`Directory already exists: ${directoryPath}`);
        }
    } catch (error) {
        // Catch errors from adapter.exists or the final throw
        console.error(`Error ensuring directory exists ${directoryPath}:`, error);
        // Re-throw a consistent error message if it's not already the specific creation failure
        if (error instanceof Error && error.message.startsWith('Failed to create directory')) {
            throw error;
        } else {
            throw new Error(`Failed to ensure directory exists ${directoryPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/**
 * Updates an existing daily note file with a new hledger transaction within a ```hledger``` block,
 * or creates the file with a header and the block if it doesn't exist.
 * Throws errors if file operations fail.
 */
export async function updateOrCreateDailyNoteHledgerSection(
    targetPath: string,
    transactionContent: string, // Assumes content includes its own trailing newline if needed initially
    transactionHeader: string,
    adapter: DataAdapter
): Promise<void> {
    try {
        const fileExists = await adapter.exists(targetPath);
        console.log(`Checking existence for ${targetPath}: ${fileExists}`);
        let finalContent = '';

        if (fileExists) {
            const file = await adapter.read(targetPath);
            console.log(`Read existing file: ${targetPath}, length: ${file.length}`);
            const hledgerRegex = /```hledger\n([\s\S]*?)```/;
            const match = file.match(hledgerRegex);

            if (match) {
                // Check if the existing content ends with a newline
                const existingTransactions = match[1];
                const needsNewline = existingTransactions.length > 0 && 
                                   !existingTransactions.endsWith('\n\n') &&
                                   !existingTransactions.trim().endsWith('\n');
                
                // Append new entry to existing hledger section
                const newContent = needsNewline ? '\n' + transactionContent : transactionContent;
                finalContent = file.replace(hledgerRegex, `\`\`\`hledger\n${match[1]}${newContent}\`\`\``);
            } else {
                // Append a new block if none found
                finalContent = file.trimEnd() + `\n\n${transactionHeader}\n\n\`\`\`hledger\n${transactionContent.trimEnd()}\n\`\`\``; // Add header too when adding block first time
                console.log(`Added new hledger block (with header) to ${targetPath}`);
            }
        } else {
            // Create new file with header and block
            finalContent = `${transactionHeader}\n\n\`\`\`hledger\n${transactionContent.trimEnd()}\n\`\`\``;
            console.log(`Creating new file with hledger block: ${targetPath}`);
        }

        console.log(`Attempting to write final content to ${targetPath}`);
        await adapter.write(targetPath, finalContent);
        console.log(`Successfully wrote to ${targetPath}`);

    } catch (error) {
        console.error(`Error updating or creating daily note section in ${targetPath}:`, error);
        // Re-throw the error so the caller can handle it (e.g., show a Notice)
        throw new Error(`Failed to update or create hledger section in ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}