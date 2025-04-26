import { App, Modal, Setting, TextComponent, Notice } from 'obsidian';
import { HledgerSettings } from '../settings';
import moment from 'moment';

export class HledgerExportModal extends Modal {
    settings: HledgerSettings;
    fromDate: string;
    toDate: string;
    journalFile: string;
    replaceExisting: boolean;
    onSubmit: (fromDate: string, toDate: string, journalFile: string, replaceExisting: boolean) => void;

    constructor(
        app: App,
        settings: HledgerSettings,
        onSubmit: (fromDate: string, toDate: string, journalFile: string, replaceExisting: boolean) => void
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        
        const now = moment();
        this.fromDate = moment().startOf('year').format('YYYY-MM-DD');
        this.toDate = now.format('YYYY-MM-DD');
        this.journalFile = now.format('YYYY') + '.journal';
        this.replaceExisting = false;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hledger-export-modal');

        contentEl.createEl('h4', { text: 'Export transactions to hledger journal' });

        new Setting(contentEl)
            .setName('From date')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.fromDate);
                text.onChange(value => this.fromDate = value);
            });

        new Setting(contentEl)
            .setName('To date')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.toDate);
                text.onChange(value => this.toDate = value);
            });

        new Setting(contentEl)
            .setName('Journal File')
            .setDesc('Name for the exported journal file')
            .addText((text: TextComponent) => {
                text.inputEl.setAttribute('type', 'text');
                text
                    .setPlaceholder(this.journalFile)
                    .setValue(this.journalFile)
                    .onChange((value) => {
                        this.journalFile = value;
                    });
            });

        new Setting(contentEl)
            .setName('Replace Existing')
            .setDesc('Replace file if it already exists')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.replaceExisting)
                    .onChange((value) => {
                        this.replaceExisting = value;
                    })
            );

        new Setting(contentEl).addButton((btn) =>
            btn
                .setButtonText('Export')
                .setCta()
                .onClick(() => {
                    const trimmedjournalFile = this.journalFile.trim();

                    if (!trimmedjournalFile) {
                        new Notice('File name cannot be empty.');
                        return;
                    }
                    
                    const invalidCharsRegex = /[\\/:*?"<>|]/;
                    if (invalidCharsRegex.test(trimmedjournalFile)) {
                        new Notice('File name contains invalid characters (e.g., \\ / : * ? " < > |).');
                        return;
                    }

                    if (!this.fromDate || !this.toDate || !trimmedjournalFile) {
                        new Notice('Please fill in all required fields.');
                        return;
                    }

                    if (moment(this.toDate).isBefore(this.fromDate)) {
                        new Notice('To date cannot be before from date');
                        return;
                    }

                    this.onSubmit(this.fromDate, this.toDate, this.journalFile, this.replaceExisting);
                    this.close();
                })
        );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 