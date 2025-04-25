import * as moment from 'moment'; // Changed import style
import { DataAdapter } from 'obsidian';
import { HledgerSettings } from './settings';

/**
 * Validates export settings to ensure required folders and formats are set
 */
export function validateExportSettings(settings: HledgerSettings): string | null {
    if (!settings.dailyNotesFolder || !settings.hledgerFolder) {
        return 'Please set both daily notes and hledger folders in settings';
    }
    
    if (!settings.hledgerDateFormat || !settings.dailyNotesDateFormat) {
        return 'Please set both hledger and daily notes date formats in settings.';
    }
    
    return null;
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
 * Splits a hledger block into individual transactions
 */
export function splitIntoTransactions(blockContent: string): string[] {
    if (!blockContent) return [];
    
    // Split the block content into individual transactions based on blank lines
    // Regex: one or more newlines, optionally followed by whitespace, then one or more newlines
    return blockContent.split(/\n\s*\n+/)
        .map(transaction => transaction.trim())
        .filter(transaction => transaction.length > 0);
}

/**
 * Formats a transaction with the proper date and indentation
 */
export function formatTransaction(transactionString: string, formattedDate: string): string {
    const lines = transactionString.split('\n');
    const firstLine = lines[0].trimEnd(); // Trim potential trailing space
    
    // Check if the first line contains 3+ spaces (posting heuristic)
    if (/\s{3,}/.test(firstLine)) {
        // No description, date on its own line. Indent ALL lines.
        const indentedLines = lines.map(line => `    ${line.trimEnd()}`); // 4 spaces indentation
        return `${formattedDate}\n${indentedLines.join('\n')}`;
    } else {
        // Description found, date on the same line. Indent ONLY lines AFTER the first.
        const header = `${formattedDate} ${firstLine}`;
        const restOfLines = lines.slice(1);
        const indentedRest = restOfLines.map(line => `    ${line.trimEnd()}`); // 4 spaces indentation
        // Handle case where there's only a description line
        return header + (indentedRest.length > 0 ? `\n${indentedRest.join('\n')}` : '');
    }
}

/**
 * Processes a daily note file to extract and format hledger transactions
 */
export async function processHledgerFile(
    filePath: string,
    adapter: any, // Would be FileSystemAdapter type from Obsidian
    dailyNotesDateFormat: string,
    hledgerDateFormat: string
): Promise<string[]> {
    const processedTransactions: string[] = [];
    
    try {
        // Extract filename without extension
        const filenameWithExt = filePath.split('/').pop() || filePath;
        const filenameWithoutExt = filenameWithExt.replace(/\.md$/, '');
        
        // Parse date from filename
        const parsedDate = moment.default(filenameWithoutExt, dailyNotesDateFormat, true); // Use strict parsing

        if (!parsedDate.isValid()) {
            console.warn(`Skipping file: Could not parse date from filename '${filenameWithoutExt}' using format '${dailyNotesDateFormat}' for file: ${filePath}`);
            return []; // Skip this file if date parsing fails
        }
        
        // Format date for hledger
        const formattedDate = parsedDate.format(hledgerDateFormat);

        // Read the whole file content
        const fileContent = await adapter.read(filePath);

        // Extract the hledger block
        const hledgerBlock = extractHledgerBlock(fileContent);
        
        if (!hledgerBlock) {
            return [];
        }

        // Split into transactions and format each one
        const transactions = splitIntoTransactions(hledgerBlock);
        
        for (const transaction of transactions) {
            const formattedTransaction = formatTransaction(transaction, formattedDate);
            processedTransactions.push(formattedTransaction);
        }
    } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
        throw new Error(`Error processing file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return processedTransactions;
}

/**
 * Processes multiple daily note files to extract hledger transactions
 */
export async function processHledgerFiles(
    filteredFiles: string[],
    adapter: any,
    dailyNotesDateFormat: string,
    hledgerDateFormat: string
): Promise<string[]> {
    const processedBlocks: string[] = [];
    
    for (const filePath of filteredFiles) {
        try {
            const transactions = await processHledgerFile(
                filePath,
                adapter,
                dailyNotesDateFormat,
                hledgerDateFormat
            );
            processedBlocks.push(...transactions);
        } catch (fileError) {
            console.error(`Error processing file ${filePath}:`, fileError);
            // Continue processing other files after logging error
        }
    }
    
    return processedBlocks;
}


/**
 * Recursively finds all file paths within a given folder.
 */
export async function getAllFilesInFolder(folderPath: string, adapter: DataAdapter): Promise<string[]> {
    const allFiles: string[] = [];
    
    try {
        const listResult = await adapter.list(folderPath);
        const queue = [...listResult.folders];
        allFiles.push(...listResult.files.map(file => file.replace(/\\/g, '/'))); // Add files from root

        while (queue.length > 0) {
            const currentFolder = queue.shift()!;
            try {
                const subFolderContent = await adapter.list(currentFolder);
                allFiles.push(...subFolderContent.files.map(file => file.replace(/\\/g, '/')));
                queue.push(...subFolderContent.folders);
            } catch (subError) {
                 console.warn(`Could not list folder ${currentFolder}:`, subError);
                 // Optionally continue processing other folders
            }
        }
    } catch (error) {
        console.error(`Error listing files in ${folderPath}:`, error);
        throw new Error(`Could not access folder: ${folderPath}`);
    }
    return allFiles;
}

/**
 * Filters a list of file paths, keeping only markdown files whose filenames 
 * represent dates within the specified range.
 */
export function filterFilesByDateRange(
    files: string[], 
    fromDateStr: string, 
    toDateStr: string, 
    dateFormat: string
): string[] {
    const fromMoment = moment.default(fromDateStr, 'YYYY-MM-DD');
    const toMoment = moment.default(toDateStr, 'YYYY-MM-DD');
    
    return files.filter(filePath => {
        const normalizedFilePath = filePath.replace(/\\/g, '/'); // Normalize input path
        
         // Only consider markdown files
        if (!normalizedFilePath.toLowerCase().endsWith('.md')) {
            return false;
        }

        const basename = normalizedFilePath.split('/').pop()?.replace(/\.md$/i, '');

        if (!basename) {
             return false;
        }

        const fileDate = moment.default(basename, dateFormat, true); // Strict parsing
        return fileDate.isValid() && fileDate.isBetween(fromMoment, toMoment, 'day', '[]'); // Inclusive
    });
}

/**
 * Reads a file and extracts the content found within ```hledger ... ``` code blocks.
 */
export async function extractHledgerBlocks(filePath: string, adapter: DataAdapter): Promise<string> {
    try {
        const fileContent = await adapter.read(filePath);
        // Make regex case-insensitive for ```hledger```
        const hledgerRegex = /```hledger\n([\s\S]*?)\n```/gi;
        let match;
        const blocks: string[] = [];
        while ((match = hledgerRegex.exec(fileContent)) !== null) {
            blocks.push(match[1].trim());
        }
        return blocks.join('\n\n'); // Join multiple blocks from the same file
    } catch (error) {
        console.warn(`Could not read or parse file ${filePath}:`, error);
        return ''; // Return empty string if file reading or parsing fails
    }
}

/**
 * Handles the logic of writing the final journal string to the target file,
 * checking for existence if replaceExisting is false.
 */
export async function writeJournalToFile(
    filePath: string, 
    content: string, 
    adapter: DataAdapter,
    replaceExisting: boolean = false
): Promise<void> {
    try {
        // Normalize path separators for reliability
        const normalizedPath = filePath.replace(/\\/g, '/');
        const lastSlashIndex = normalizedPath.lastIndexOf('/');
        const parentDir = lastSlashIndex > 0 ? normalizedPath.substring(0, lastSlashIndex) : '';

        if (parentDir) { // Ensure parentDir is not empty and exists
            // Check if the directory exists BEFORE attempting to create it
            if (!(await adapter.exists(parentDir))) {
                try {
                    // Attempt to create the directory if it doesn't exist.
                    await adapter.mkdir(parentDir);
                } catch (mkdirError) {
                    // Double-check existence in case of race condition or permission error
                    if (!(await adapter.exists(parentDir))) {
                        console.error(`Failed to create directory ${parentDir}:`, mkdirError);
                        throw new Error(`Failed to create directory ${parentDir}: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`);
                    }
                    // If it exists now, we can ignore the mkdir error and proceed.
                }
            }
        }

        // Check if the file exists and if we should replace it
        if (!replaceExisting && await adapter.exists(normalizedPath)) {
             throw new Error(`File ${normalizedPath} already exists and replaceExisting is false.`);
        }

        // Write the file
        await adapter.write(normalizedPath, content);
    } catch (error) {
        console.error(`Error writing to file ${filePath}:`, error);
        // Check if the error message already indicates the failure reason
        if (error instanceof Error && (error.message.startsWith('Failed to') || error.message.includes('already exists'))) {
            throw error; // Re-throw specific failure messages
        }
        throw new Error(`Failed to write journal to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
