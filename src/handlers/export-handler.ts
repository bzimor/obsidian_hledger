import { DataAdapter, moment } from 'obsidian';
import { HledgerSettings } from '../settings';
import { 
    extractHledgerBlock, 
    getDateFromFilename, 
    normalizePath, 
    ensureDirectoryExists,
    getParentDirectory,
    extractTransactionDate
} from '../utils';

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
 * Splits a hledger block into individual transactions
 */
export function splitIntoTransactions(blockContent: string): string[] {
    if (!blockContent) return [];
    
    return blockContent.split(/\n\s*\n+/)
        .map(transaction => transaction.trim())
        .filter(transaction => transaction.length > 0);
}

/**
 * Formats a transaction with the proper date and indentation
 */
export function formatTransaction(transactionString: string, formattedDate: string, hledgerDateFormat: string = 'YYYY-MM-DD'): string {
    const lines = transactionString.split('\n');
    const firstLine = lines[0].trimEnd();
    
    const existingDate = extractTransactionDate(firstLine, hledgerDateFormat);
    const hasDateAlready = existingDate !== null;
    
    if (/\s{3,}/.test(firstLine)) {
        const indentedLines = lines.map(line => `    ${line.trimEnd()}`);
        return `${formattedDate}\n${indentedLines.join('\n')}`;
    } else if (hasDateAlready) {
        const restOfLines = lines.slice(1);
        
        const normalizedIndentedLines = restOfLines.map(line => {
            const trimmedLine = line.replace(/^\s+/, '');
            return `    ${trimmedLine}`;
        });
        
        return `${firstLine}${normalizedIndentedLines.length > 0 ? `\n${normalizedIndentedLines.join('\n')}` : ''}`;
    } else {
        const header = `${formattedDate} ${firstLine}`;
        const restOfLines = lines.slice(1);
        const indentedRest = restOfLines.map(line => `    ${line.trimEnd()}`);
        return header + (indentedRest.length > 0 ? `\n${indentedRest.join('\n')}` : '');
    }
}

/**
 * Processes a daily note file to extract and format hledger transactions
 */
export async function processHledgerFile(
    filePath: string,
    adapter: DataAdapter,
    dailyNotesDateFormat: string,
    hledgerDateFormat: string
): Promise<string[]> {
    const processedTransactions: string[] = [];
    
    try {
        let parsedDate;
        
        if (dailyNotesDateFormat.includes('/')) {
            const pathParts = filePath.split('/');
            
            if (pathParts.length >= 2) {
                const dirName = pathParts[pathParts.length - 2]; 
                const fileName = pathParts[pathParts.length - 1].replace(/\.md$/i, '');
                const fullDateStr = `${dirName}/${fileName}`;
                
                parsedDate = moment(fullDateStr, dailyNotesDateFormat, true);
            }
        } else {
            const filenameWithExt = filePath.split('/').pop() || filePath;
            const filenameWithoutExt = filenameWithExt.replace(/\.md$/, '');
            
            parsedDate = moment(filenameWithoutExt, dailyNotesDateFormat, true);
        }

        if (!parsedDate || !parsedDate.isValid()) {
            console.warn(`Skipping file: Could not parse date from file path '${filePath}' using format '${dailyNotesDateFormat}'`);
            return [];
        }
        
        const formattedDate = parsedDate.format(hledgerDateFormat);
        const fileContent = await adapter.read(filePath);
        
        const hledgerBlock = extractHledgerBlock(fileContent);
        
        if (!hledgerBlock) {
            console.warn(`No hledger blocks found in file: ${filePath}`);
            return [];
        }

        const transactions = splitIntoTransactions(hledgerBlock);
        
        for (const transaction of transactions) {
            const formattedTransaction = formatTransaction(transaction, formattedDate, hledgerDateFormat);
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
    adapter: DataAdapter,
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
        }
    }
    
    return processedBlocks;
}

/**
 * Recursively finds all file paths within a given folder
 */
export async function getAllFilesInFolder(folderPath: string, adapter: DataAdapter): Promise<string[]> {
    const allFiles: string[] = [];
    
    try {
        const listResult = await adapter.list(folderPath);
        const queue = [...listResult.folders];
        allFiles.push(...listResult.files.map(file => normalizePath(file)));

        while (queue.length > 0) {
            const currentFolder = queue.shift()!;
            try {
                const subFolderContent = await adapter.list(currentFolder);
                allFiles.push(...subFolderContent.files.map(file => normalizePath(file)));
                queue.push(...subFolderContent.folders);
            } catch (subError) {
                 console.warn(`Could not list folder ${currentFolder}:`, subError);
            }
        }
    } catch (error) {
        console.error(`Error listing files in ${folderPath}:`, error);
        throw new Error(`Could not access folder: ${folderPath}`);
    }
    return allFiles;
}

/**
 * Filters a list of file paths by date range
 */
export function filterFilesByDateRange(
    files: string[], 
    fromDateStr: string, 
    toDateStr: string, 
    dateFormat: string
): string[] {
    const fromMoment = moment(fromDateStr, 'YYYY-MM-DD');
    const toMoment = moment(toDateStr, 'YYYY-MM-DD');
    
    return files.filter(filePath => {
        const normalizedFilePath = normalizePath(filePath);
        
        if (!normalizedFilePath.toLowerCase().endsWith('.md')) {
            return false;
        }

        if (dateFormat.includes('/')) {
            const pathParts = normalizedFilePath.split('/');
            if (pathParts.length >= 2) {
                const dirName = pathParts[pathParts.length - 2];
                const fileName = pathParts[pathParts.length - 1].replace(/\.md$/i, '');
                
                const formatParts = dateFormat.split('/');
                const dirFormat = formatParts[0];
                const fileFormat = formatParts[1];
                
                const dirDate = moment(dirName, dirFormat, true);
                if (!dirDate.isValid()) {
                    return false;
                }
                
                const fullDateStr = `${dirName}/${fileName}`;
                const fileDate = moment(fullDateStr, dateFormat, true);
                
                return fileDate.isValid() && fileDate.isBetween(fromMoment, toMoment, 'day', '[]');
            }
            return false;
        }
        
        const basename = normalizedFilePath.split('/').pop()?.replace(/\.md$/i, '');

        if (!basename) {
            return false;
        }

        const fileDate = moment(basename, dateFormat, true);
        return fileDate.isValid() && fileDate.isBetween(fromMoment, toMoment, 'day', '[]');
    });
}

/**
 * Writes transactions to a journal file
 */
export async function writeJournalToFile(
    filePath: string, 
    content: string, 
    adapter: DataAdapter,
    replaceExisting: boolean = false
): Promise<void> {
    try {
        const folder = getParentDirectory(filePath);
        if (folder) {
            await ensureDirectoryExists(folder, adapter);
        }
        
        const fileExists = await adapter.exists(filePath);
        
        if (fileExists && !replaceExisting) {
            const newFilePath = await generateIncrementedFilePath(filePath, adapter);
            await adapter.write(newFilePath, content);
        } else {
            await adapter.write(filePath, content);
        }
    } catch (error) {
        console.error(`Error writing to journal file ${filePath}:`, error);
        throw new Error(`Failed to write to journal file: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Generates an incremented file path when the original file already exists
 * Example: if "file.txt" exists, returns "file_1.txt", then "file_2.txt", etc.
 */
async function generateIncrementedFilePath(
    originalPath: string,
    adapter: DataAdapter
): Promise<string> {
    const lastDotIndex = originalPath.lastIndexOf('.');
    const basePath = lastDotIndex !== -1 ? originalPath.substring(0, lastDotIndex) : originalPath;
    const extension = lastDotIndex !== -1 ? originalPath.substring(lastDotIndex) : '';
    
    let counter = 1;
    let newPath = `${basePath}_${counter}${extension}`;
    
    while (await adapter.exists(newPath)) {
        counter++;
        newPath = `${basePath}_${counter}${extension}`;
    }
    
    return newPath;
} 