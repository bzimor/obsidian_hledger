import { App, Modal, Setting, Notice } from 'obsidian';
import { HledgerSettings } from '../settings';
import moment from 'moment';

export class HledgerImportModal extends Modal {
    settings: HledgerSettings;
    fromDate: string;
    toDate: string;
    journalFile: string;
    onSubmit: (fromDate: string, toDate: string, journalFile: string) => void;

    constructor(
        app: App,
        settings: HledgerSettings,
        onSubmit: (fromDate: string, toDate: string, journalFile: string) => void
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        
        const now = moment();
        this.fromDate = moment().startOf('year').format('YYYY-MM-DD');
        this.toDate = now.format('YYYY-MM-DD');
        this.journalFile = 'hledger.journal';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hledger-modal');

        contentEl.createEl('h4', { text: 'Import transactions from hledger journal' });

        contentEl.createEl("div", {
            cls: "hledger-warning-note",
            text: "Note: This action will override all transactions in your daily notes",
          });
        
        new Setting(contentEl)
            .setName('From date')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.fromDate)
                    .onChange(async (value) => {
                        this.fromDate = value;
                    });
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
            .setDesc('Journal file name to import transactions from')
            .addText(text => text
                .setPlaceholder(this.journalFile)
                .setValue(this.journalFile)
                .onChange(async (value) => {
                    this.journalFile = value;
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Import')
                .setCta()
                .onClick(() => {
                    if (!this.journalFile.trim()) {
                        new Notice('Please enter a journal filename.');
                        return;
                    }
                    if (!this.fromDate || !this.toDate) {
                        new Notice('Please select valid dates.');
                        return;
                    }
                    if (moment(this.toDate).isBefore(this.fromDate)) {
                        new Notice('To date cannot be before From date.');
                        return;
                    }
                    
                    this.onSubmit(this.fromDate, this.toDate, this.journalFile);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 