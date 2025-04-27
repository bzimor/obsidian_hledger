import { App, Modal, Setting, TextComponent, Notice } from 'obsidian';
import { HledgerSettings } from '../settings';
import moment from 'moment';

interface ExportOptions {
    fromDate: string;
    toDate: string;
    journalFile: string;
    replaceExisting: boolean;
}

type ExportCallback = (fromDate: string, toDate: string, journalFile: string, replaceExisting: boolean) => void;

export class HledgerExportModal extends Modal {
    private options: ExportOptions;
    private settings: HledgerSettings;
    private onSubmit: ExportCallback;

    constructor(
        app: App,
        settings: HledgerSettings,
        onSubmit: ExportCallback
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
            journalFile: now.format('YYYY') + '.journal',
            replaceExisting: false
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hledger-export-modal');

        this.createHeader(contentEl);
        this.createDateInputs(contentEl);
        this.createFileOptions(contentEl);
        this.createExportButton(contentEl);
        
        // Add keyboard shortcut for quick export
        contentEl.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.handleExport();
            }
        });
    }
    
    private createHeader(contentEl: HTMLElement): void {
        contentEl.createEl('h4', { text: 'Export transactions to hledger journal' });
    }
    
    private createDateInputs(contentEl: HTMLElement): void {
        new Setting(contentEl)
            .setName('From')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.options.fromDate);
                text.onChange(value => this.options.fromDate = value);
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
            .setDesc('Name for the exported journal file')
            .addText((text: TextComponent) => {
                text.inputEl.setAttribute('type', 'text');
                text
                    .setPlaceholder(this.options.journalFile)
                    .setValue(this.options.journalFile)
                    .onChange((value) => {
                        this.options.journalFile = value;
                    });
            });

        new Setting(contentEl)
            .setName('Replace Existing')
            .setDesc('Replace file if it already exists')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.options.replaceExisting)
                    .onChange((value) => {
                        this.options.replaceExisting = value;
                    })
            );
    }
    
    private createExportButton(contentEl: HTMLElement): void {
        new Setting(contentEl).addButton((btn) =>
            btn
                .setButtonText('Export')
                .setCta()
                .onClick(() => this.handleExport())
        );
    }
    
    private handleExport(): void {
        if (!this.validate()) {
            return;
        }
        
        this.onSubmit(
            this.options.fromDate,
            this.options.toDate,
            this.options.journalFile.trim(),
            this.options.replaceExisting
        );
        
        this.close();
    }
    
    private validate(): boolean {
        const { fromDate, toDate, journalFile } = this.options;
        const trimmedJournalFile = journalFile.trim();
        
        if (!trimmedJournalFile) {
            new Notice('File name cannot be empty.');
            return false;
        }
        
        const invalidCharsRegex = /[\\/:*?"<>|]/;
        if (invalidCharsRegex.test(trimmedJournalFile)) {
            new Notice('File name contains invalid characters (e.g., \\ / : * ? " < > |).');
            return false;
        }

        if (!fromDate || !toDate) {
            new Notice('Please fill in all required date fields.');
            return false;
        }

        if (moment(toDate).isBefore(fromDate)) {
            new Notice('To date cannot be before from date');
            return false;
        }
        
        // Check if file extension is valid
        if (!trimmedJournalFile.endsWith('.journal') && 
            !trimmedJournalFile.endsWith('.hledger') && 
            !trimmedJournalFile.endsWith('.ledger')) {
            new Notice('File should have .journal, .hledger, or .ledger extension');
            return false;
        }
        
        return true;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 