import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import HledgerPlugin from './main';

export interface HledgerSettings {
    dailyNotesFolder: string;
    dailyNotesDateFormat: string;
    transactionHeader: string;

    currencies: string[];
    includeDateInTransactions: boolean;
    transactionLineLength: number;
    amountFormat: 'comma-dot' | 'space-comma' | 'dot-comma';
    currencyPlacement: 'prepend' | 'append';
    currencySpacing: boolean;

    hledgerFolder: string;
    accountsFile: string;
    hledgerDateFormat: string;
}

export const DEFAULT_SETTINGS: HledgerSettings = {
    dailyNotesFolder: '',
    dailyNotesDateFormat: 'YYYY-MM-DD',
    transactionHeader: '## Transactions',

    currencies: ['$', '€', '£', '¥', '₹'],
    includeDateInTransactions: true,
    transactionLineLength: 80,
    amountFormat: 'comma-dot',
    currencyPlacement: 'prepend',
    currencySpacing: true,

    hledgerFolder: '',
    accountsFile: 'accounts.md',
    hledgerDateFormat: 'YYYY-MM-DD'
};

export class HledgerSettingTab extends PluginSettingTab {
    plugin: HledgerPlugin;

    constructor(app: App, plugin: HledgerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h3', { text: 'Daily Note Settings' });

        new Setting(containerEl)
            .setName('Daily notes folder')
            .setDesc('Path to the folder where daily transaction notes will be stored')
            .addSearch(search => {
                search
                    .setPlaceholder('daily/transactions')
                    .setValue(this.plugin.settings.dailyNotesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNotesFolder = value;
                        await this.plugin.saveSettings();
                    });
                
                const folders = this.app.vault.getAllLoadedFiles()
                    .filter((f): f is TFolder => f instanceof TFolder)
                    .map(folder => folder.path);
                
                const searchEl = (search as any).containerEl as HTMLElement;
                searchEl.addClass('settings-search');
                
                search.inputEl.addEventListener('focus', () => {
                    const currentValue = search.inputEl.value;
                    const suggestions = folders.filter(f => 
                        f.toLowerCase().contains(currentValue.toLowerCase()));
                    
                    let suggestionsContainer = searchEl.querySelector('.folder-suggestions');
                    if (!suggestionsContainer) {
                        suggestionsContainer = createDiv('folder-suggestions');
                        searchEl.appendChild(suggestionsContainer);
                    } else {
                        suggestionsContainer.empty();
                    }
                    
                    suggestions.forEach(suggestion => {
                        const suggestionEl = suggestionsContainer.createDiv('suggestion-item');
                        suggestionEl.setText(suggestion);
                        suggestionEl.onClickEvent(() => {
                            const event = new Event('input', { bubbles: true });
                            search.inputEl.value = suggestion;
                            search.inputEl.dispatchEvent(event);
                            suggestionsContainer.remove();
                        });
                    });
                });
                
                document.addEventListener('click', (e) => {
                    const suggestionsContainer = searchEl.querySelector('.folder-suggestions');
                    if (suggestionsContainer && !searchEl.contains(e.target as Node)) {
                        suggestionsContainer.remove();
                    }
                });
            });

        new Setting(containerEl)
            .setName('Daily notes date format')
            .setDesc('Format for daily note filenames (using moment.js format)')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD')
                .setValue(this.plugin.settings.dailyNotesDateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dailyNotesDateFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Transaction section header')
            .setDesc('Header text for the transactions section in daily notes')
            .addText(text => text
                .setPlaceholder('## Transactions')
                .setValue(this.plugin.settings.transactionHeader)
                .onChange(async (value) => {
                    this.plugin.settings.transactionHeader = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Transaction Settings' });

        new Setting(containerEl)
            .setName('Currencies')
            .setDesc('List of currencies (comma-separated)')
            .addText(text => text
                .setPlaceholder('$,€,£,¥,₹')
                .setValue(this.plugin.settings.currencies.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.currencies = value.split(',').map(c => c.trim());
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include date in daily transactions')
            .setDesc('Whether to include the date in each transaction entry in daily notes')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateInTransactions)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateInTransactions = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Transaction line length')
            .setDesc('Maximum length of transaction lines')
            .addText(text => text
                .setPlaceholder('80')
                .setValue(this.plugin.settings.transactionLineLength.toString())
                .onChange(async (value) => {
                    const length = parseInt(value);
                    if (!isNaN(length)) {
                        this.plugin.settings.transactionLineLength = length;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Amount format')
            .setDesc('Format for numbers in transactions')
            .addDropdown(dropdown => dropdown
                .addOption('comma-dot', '1,234.56')
                .addOption('space-comma', '1 234,56')
                .addOption('dot-comma', '1.234,56')
                .setValue(this.plugin.settings.amountFormat)
                .onChange(async (value: 'comma-dot' | 'space-comma' | 'dot-comma') => {
                    this.plugin.settings.amountFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Currency placement')
            .setDesc('Where to place the currency symbol')
            .addDropdown(dropdown => dropdown
                .addOption('prepend', 'Before amount ($ 123.45)')
                .addOption('append', 'After amount (123.45 $)')
                .setValue(this.plugin.settings.currencyPlacement)
                .onChange(async (value: 'prepend' | 'append') => {
                    this.plugin.settings.currencyPlacement = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Currency spacing')
            .setDesc('Add space between currency symbol and amount')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.currencySpacing)
                .onChange(async (value) => {
                    this.plugin.settings.currencySpacing = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Hledger Settings' });

        new Setting(containerEl)
            .setName('Hledger folder path')
            .setDesc('Path to the folder in your Obsidian vault where hledger files will be stored')
            .addSearch(search => {
                search
                    .setPlaceholder('hledger')
                    .setValue(this.plugin.settings.hledgerFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.hledgerFolder = value;
                        await this.plugin.saveSettings();
                    });
                
                const folders = this.app.vault.getAllLoadedFiles()
                    .filter((f): f is TFolder => f instanceof TFolder)
                    .map(folder => folder.path);
                
                const searchEl = (search as any).containerEl as HTMLElement;
                searchEl.addClass('settings-search');
                
                search.inputEl.addEventListener('focus', () => {
                    const currentValue = search.inputEl.value;
                    const suggestions = folders.filter(f => 
                        f.toLowerCase().contains(currentValue.toLowerCase()));
                    
                    let suggestionsContainer = searchEl.querySelector('.folder-suggestions');
                    if (!suggestionsContainer) {
                        suggestionsContainer = createDiv('folder-suggestions');
                        searchEl.appendChild(suggestionsContainer);
                    } else {
                        suggestionsContainer.empty();
                    }
                    
                    suggestions.forEach(suggestion => {
                        const suggestionEl = suggestionsContainer.createDiv('suggestion-item');
                        suggestionEl.setText(suggestion);
                        suggestionEl.onClickEvent(() => {
                            const event = new Event('input', { bubbles: true });
                            search.inputEl.value = suggestion;
                            search.inputEl.dispatchEvent(event);
                            suggestionsContainer.remove();
                        });
                    });
                });
                
                document.addEventListener('click', (e) => {
                    const suggestionsContainer = searchEl.querySelector('.folder-suggestions');
                    if (suggestionsContainer && !searchEl.contains(e.target as Node)) {
                        suggestionsContainer.remove();
                    }
                });
            });

        new Setting(containerEl)
            .setName('Hledger date format')
            .setDesc('Format for dates in hledger journal entries (using moment.js format)')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD')
                .setValue(this.plugin.settings.hledgerDateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.hledgerDateFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Accounts file name')
            .setDesc('Name of the accounts file in Hledger folder that will be used for account autosuggestion')
            .addText(text => text
                .setPlaceholder('accounts.md')
                .setValue(this.plugin.settings.accountsFile)
                .onChange(async (value) => {
                    this.plugin.settings.accountsFile = value;
                    await this.plugin.saveSettings();
                }));
    }
} 