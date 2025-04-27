import { App, Modal, Setting, Notice } from 'obsidian';
import { HledgerSettings } from '../settings';
import moment from 'moment';

interface ImportOptions {
    fromDate: string;
    toDate: string;
    journalFile: string;
}

type ImportCallback = (fromDate: string, toDate: string, journalFile: string) => void;

export class HledgerImportModal extends Modal {
    private options: ImportOptions;
    private settings: HledgerSettings;
    private onSubmit: ImportCallback;

    constructor(
        app: App,
        settings: HledgerSettings,
        onSubmit: ImportCallback
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        
        this.initializeDefaultOptions();
    }

    private initializeDefaultOptions(): void {
        const now = moment();
        
        this.options = {
            fromDate: moment().startOf('year').format('YYYY-MM-DD'),
            toDate: now.format('YYYY-MM-DD'),
            journalFile: 'hledger.journal'
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hledger-modal');

        this.createHeader(contentEl);
        this.createWarningNote(contentEl);
        this.createDateInputs(contentEl);
        this.createFileOptions(contentEl);
        this.createImportButton(contentEl);
        
        // Add keyboard shortcut for quick import
        contentEl.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.handleImport();
            }
        });
    }
    
    private createHeader(contentEl: HTMLElement): void {
        contentEl.createEl('h4', { text: 'Import transactions from hledger journal' });
    }
    
    private createWarningNote(contentEl: HTMLElement): void {
        contentEl.createEl("div", {
            cls: "hledger-warning-note",
            text: "Note: This action will override all transactions in your daily notes"
        });
    }
    
    private createDateInputs(contentEl: HTMLElement): void {
        new Setting(contentEl)
            .setName('From')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.options.fromDate)
                    .onChange(value => {
                        this.options.fromDate = value;
                    });
            });

        new Setting(contentEl)
            .setName('To')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.options.toDate);
                text.onChange(value => this.options.toDate = value);
            });
    }
    
    private createFileOptions(contentEl: HTMLElement): void {
        new Setting(contentEl)
            .setName('Journal File')
            .setDesc('Journal file name to import transactions from')
            .addText(text => text
                .setPlaceholder(this.options.journalFile)
                .setValue(this.options.journalFile)
                .onChange(value => {
                    this.options.journalFile = value;
                }));
    }
    
    private createImportButton(contentEl: HTMLElement): void {
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Import')
                .setCta()
                .onClick(() => this.handleImport())
            );
    }
    
    private handleImport(): void {
        if (!this.validate()) {
            return;
        }
        
        this.onSubmit(
            this.options.fromDate,
            this.options.toDate,
            this.options.journalFile.trim()
        );
        
        this.close();
    }
    
    private validate(): boolean {
        const { fromDate, toDate, journalFile } = this.options;
        const trimmedJournalFile = journalFile.trim();
        
        if (!trimmedJournalFile) {
            new Notice('Please enter a journal filename.');
            return false;
        }
        
        if (!fromDate || !toDate) {
            new Notice('Please select valid dates.');
            return false;
        }
        
        if (moment(toDate).isBefore(fromDate)) {
            new Notice('To date cannot be before From date.');
            return false;
        }
        
        // Validate file exists in hledger folder if specified
        if (this.settings.hledgerFolder) {
            // Just check extension for now
            if (!trimmedJournalFile.endsWith('.journal') && 
                !trimmedJournalFile.endsWith('.hledger') && 
                !trimmedJournalFile.endsWith('.ledger')) {
                new Notice('File should have .journal, .hledger, or .ledger extension');
                return false;
            }
        }
        
        return true;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 