import { Plugin, Notice } from 'obsidian';
import { HledgerSettingTab, HledgerSettings, DEFAULT_SETTINGS } from './settings';
import { HledgerEntryModal } from './ui/entry-modal';
import { HledgerExportModal } from './ui/export-modal';
import { HledgerImportModal } from './ui/import-modal';
import { 
    formatLine, 
    calculateDailyNotePathInfo,
    updateOrCreateDailyNoteHledgerSection,
    validateExportSettings, 
    processHledgerFiles,
    getAllFilesInFolder, 
    filterFilesByDateRange, 
    writeJournalToFile,
    validateImportSettings,
    groupTransactionsByDate,
    processTransactionsToDailyNotes,
    formatHledgerTransaction
} from './handlers';
import { 
    ensureDirectoryExists, 
    parseJournalTransactions, 
    normalizePath,
    FormatConfig 
} from './utils';
import * as moment from 'moment';

export default class HledgerPlugin extends Plugin {
    settings: HledgerSettings;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.addRibbonIcon('dollar-sign', 'Add hledger Entry', () => {
            new HledgerEntryModal(this.app, this.settings, this.handleEntry.bind(this)).open();
        });

        this.addSettingTab(new HledgerSettingTab(this.app, this));

        this.addCommand({
            id: 'add-hledger-entry',
            name: 'Add hledger Entry',
            callback: () => {
                new HledgerEntryModal(this.app, this.settings, this.handleEntry.bind(this)).open();
            }
        });

        this.addCommand({
            id: 'export-hledger-journal',
            name: 'Export transactions from daily notes to journal file',
            callback: () => {
                new HledgerExportModal(this.app, this.settings, this.handleExport.bind(this)).open();
            }
        });

        this.addCommand({
            id: 'import-daily-transactions',
            name: 'Import transactions from journal file to daily notes',
            callback: () => {
                new HledgerImportModal(this.app, this.settings, this.handleImport.bind(this)).open();
            }
        });
    }

    onunload(): void {
        console.log('Unloading hledger plugin');
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    private async handleEntry(date: string, description: string, entries: { account: string; amount: number; currency: string }[]): Promise<void> {
        if (!this.settings.dailyNotesFolder) {
            new Notice('Please set a daily notes folder in settings');
            return;
        }

        const formatConfig: FormatConfig = {
            numberFormat: this.settings.amountFormat,
            currencySpacing: this.settings.currencySpacing,
            currencyPlacement: this.settings.currencyPlacement,
            lineLength: this.settings.transactionLineLength
        };

        const dateObj = moment.default(date);
        
        const { targetFolder, targetPath } = calculateDailyNotePathInfo(
            dateObj,
            this.settings.dailyNotesFolder,
            this.settings.dailyNotesDateFormat
        );

        try {
            await ensureDirectoryExists(targetFolder, this.app.vault.adapter);

            const formattedTransaction = formatHledgerTransaction(
                dateObj,
                description,
                entries,
                {
                    includeDateInTransactions: this.settings.includeDateInTransactions,
                    hledgerDateFormat: this.settings.hledgerDateFormat
                },
                formatConfig, 
                formatLine
            );
            let content = formattedTransaction + '\n';

            await updateOrCreateDailyNoteHledgerSection(
                targetPath,
                content,
                this.settings.transactionHeader,
                this.app.vault.adapter
            );
            
            new Notice('hledger entry saved successfully');
            
        } catch (error) {
            console.error('Error saving hledger entry:', error);
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Error saving hledger entry: ${message}`);
        }
    }

    private async handleExport(fromDate: string, toDate: string, fileName: string, replaceExisting: boolean): Promise<void> {
        const validationError = validateExportSettings(this.settings);

        if (validationError) {
            new Notice(validationError);
            return;
        }

        const adapter = this.app.vault.adapter;
        const dailyNotesFormat = this.settings.dailyNotesDateFormat;
        const hledgerFormat = this.settings.hledgerDateFormat;

        try {
            const allFiles = await getAllFilesInFolder(this.settings.dailyNotesFolder!, adapter);
            const filteredFiles = filterFilesByDateRange(allFiles, fromDate, toDate, dailyNotesFormat);
    
            if (filteredFiles.length === 0) {
                new Notice('No daily notes found in the specified date range.');
                return;
            }
    
            const processedBlocks = await processHledgerFiles(
                filteredFiles,
                adapter,
                dailyNotesFormat,
                hledgerFormat
            );
    
            if (processedBlocks.length === 0) {
                new Notice('No hledger content found in the daily notes within the date range.');
                return;
            }
    
            const journalContent = processedBlocks.join('\n\n') + '\n';
            const exportFilePath = normalizePath(`${this.settings.hledgerFolder}/${fileName}`);
            
            await writeJournalToFile(
                exportFilePath,
                journalContent,
                adapter,
                replaceExisting
            );
            
            new Notice(`Journal exported successfully to ${exportFilePath}`);
        } catch (error) {
            console.error('Error during export:', error);
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Error exporting journal: ${message}`);
        }
    }

    private async handleImport(fromDate: string, toDate: string, journalFile: string): Promise<void> {
        const validationError = validateImportSettings(this.settings);
        
        if (validationError) {
            new Notice(validationError);
            return;
        }
        
        const journalFilePath = normalizePath(`${this.settings.hledgerFolder}/${journalFile}`);
        const adapter = this.app.vault.adapter;
        
        new Notice(`Starting hledger journal import from ${journalFilePath}...`);
        
        if (!await adapter.exists(journalFilePath)) {
            new Notice(`Journal file not found at ${journalFilePath}`);
            return;
        }
        
        try {
            const journalContent = await adapter.read(journalFilePath);
            const transactions = parseJournalTransactions(journalContent, this.settings.hledgerDateFormat);
            
            const dateRangeTransactions = groupTransactionsByDate(
                transactions,
                fromDate,
                toDate,
                this.settings.hledgerDateFormat
            );

            await processTransactionsToDailyNotes(
                dateRangeTransactions,
                this.settings,
                adapter
            );

            new Notice('Daily transactions imported successfully');
        } catch (error) {
            console.error('Error importing daily transactions:', error);
            new Notice('Error importing daily transactions: ' + error.message);
        }
    }
}