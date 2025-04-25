import { App, Modal, TFile, FuzzySuggestModal, Notice } from 'obsidian';
import { HledgerSettings } from '../settings';
import moment from 'moment';


class AccountSuggestModal extends FuzzySuggestModal<string> {
    private accounts: string[];
    private onChoose: (item: string) => void;

    constructor(app: App, accounts: string[], onChoose: (item: string) => void) {
        super(app);
        this.accounts = accounts;
        this.onChoose = onChoose;
    }

    getItems(): string[] {
        return this.accounts;
    }

    getItemText(item: string): string {
        return item;
    }

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

export class HledgerEntryModal extends Modal {
    date: string;
    description: string;
    entries: { account: string; amount: number; currency: string }[];
    onSubmit: (date: string, description: string, entries: { account: string; amount: number; currency: string }[]) => void;
    settings: HledgerSettings;
    accounts: string[] = [];
    isExchange: boolean;
    exchangeAmount: number | null;

    constructor(
        app: App,
        settings: HledgerSettings,
        onSubmit: (date: string, description: string, entries: { account: string; amount: number; currency: string }[]) => void
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const basename = activeFile.basename.replace('.md', '');
            const dateFormat = settings.dailyNotesDateFormat.includes('/') 
                ? settings.dailyNotesDateFormat.split('/').pop() || settings.dailyNotesDateFormat
                : settings.dailyNotesDateFormat;
            const fileNameDate = moment(basename, dateFormat, true);
            if (fileNameDate.isValid()) {
                this.date = fileNameDate.format('YYYY-MM-DD');
            } else {
                this.date = moment().format('YYYY-MM-DD');
            }
        } else {
            this.date = moment().format('YYYY-MM-DD');
        }
        
        this.description = '';
        this.entries = [{ account: '', amount: 0, currency: settings.currencies[0] }];
        this.isExchange = false;
        this.exchangeAmount = null;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hledger-modal');

        await this.loadAccounts();

        const dateRow = contentEl.createDiv({ cls: 'hledger-date-row' });

        const typeToggle = dateRow.createEl('select', {
            cls: 'dropdown hledger-type-toggle'
        });

        typeToggle.createEl('option', {
            text: 'Transaction',
            value: 'transaction'
        });
        typeToggle.createEl('option', {
            text: 'Exchange',
            value: 'exchange'
        });

        typeToggle.value = this.isExchange ? 'exchange' : 'transaction';

        const dateInput = dateRow.createEl('input', {
            type: 'date',
            value: this.date,
            cls: 'hledger-date-input'
        });
        dateInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.date = target.value;
        });

        const descriptionInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Description',
            value: this.description,
            cls: 'text-input hledger-description-input'
        });
        descriptionInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.description = target.value;
        });

        const entriesContainer = contentEl.createDiv('hledger-entries-container');
        this.renderAccountEntries(entriesContainer);

        const buttonsContainer = contentEl.createDiv('hledger-buttons-container');
        
        const leftButtons = buttonsContainer.createDiv('hledger-left-buttons');
        
        const SVG_NS = "http://www.w3.org/2000/svg";

        const svgEl = document.createElementNS(SVG_NS, "svg");
        svgEl.setAttribute("xmlns", SVG_NS);
        svgEl.setAttribute("width", "24");
        svgEl.setAttribute("height", "24");
        svgEl.setAttribute("viewBox", "0 0 24 24");
        svgEl.setAttribute("fill", "none");
        svgEl.setAttribute("stroke", "currentColor");
        svgEl.setAttribute("stroke-width", "2");
        svgEl.setAttribute("stroke-linecap", "round");
        svgEl.setAttribute("stroke-linejoin", "round");
        svgEl.setAttribute("class", "svg-icon lucide-plus");

        const path1 = document.createElementNS(SVG_NS, "path");
        path1.setAttribute("d", "M5 12h14");
        svgEl.appendChild(path1);

        const path2 = document.createElementNS(SVG_NS, "path");
        path2.setAttribute("d", "M12 5v14");
        svgEl.appendChild(path2);
        let addAccountButtonEl: HTMLElement | null = null;
        
        if (!this.isExchange) {        
            const addAccountButton = leftButtons.createEl('button', {
                cls: 'hledger-add-account-button'
            });
            addAccountButton.empty();
            addAccountButton.appendChild(svgEl);
            addAccountButton.addEventListener('click', () => {
                const lastEntry = this.entries[this.entries.length - 1];
                const totalAmount = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
                this.entries.push({
                    account: '',
                    amount: -totalAmount,
                    currency: lastEntry.currency
                });
                this.renderAccountEntries(entriesContainer);
            });
            addAccountButtonEl = addAccountButton;
        }

        const submitButton = buttonsContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Submit'
        });
        submitButton.addEventListener('click', () => {
            const emptyAccounts = this.entries.filter(entry => !entry.account.trim());
            if (emptyAccounts.length > 0) {
                new Notice('Please fill in all account names');
                return;
            }

            const zeroAmounts = this.entries.filter(entry => entry.amount === 0);
            if (zeroAmounts.length > 0) {
                new Notice('Amounts cannot be zero');
                return;
            }

            if (!this.isExchange) {
                const totalAmount = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
                const epsilon = 0.0001; // Small tolerance for floating point comparison
                if (Math.abs(totalAmount) > epsilon) {
                    new Notice(`Transaction does not balance. Total is ${totalAmount.toFixed(2)}`);
                    return;
                }
            }

            this.onSubmit(this.date, this.description, this.entries);
            this.close();
        });

        typeToggle.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.isExchange = target.value === 'exchange';
            if (this.isExchange) {
                this.entries = [
                    { account: '', amount: 0, currency: this.settings.currencies[0] },
                    { account: '', amount: 0, currency: this.settings.currencies[1] }
                ];
                if (addAccountButtonEl) {
                    addAccountButtonEl.remove();
                    addAccountButtonEl = null;
                }
            } else {
                this.entries = [{ account: '', amount: 0, currency: this.settings.currencies[0] }];
                if (!addAccountButtonEl) {
                    const addAccountButton = leftButtons.createEl('button', {
                        cls: 'hledger-add-account-button'
                    });
                    addAccountButton.empty();
                    addAccountButton.appendChild(svgEl);
                    addAccountButton.addEventListener('click', () => {
                        const lastEntry = this.entries[this.entries.length - 1];
                        const totalAmount = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
                        this.entries.push({
                            account: '',
                            amount: -totalAmount,
                            currency: lastEntry.currency
                        });
                        this.renderAccountEntries(entriesContainer);
                    });
                    addAccountButtonEl = addAccountButton;
                }
            }
            this.renderAccountEntries(entriesContainer);
        });
    }

    private async loadAccounts() {
        if (!this.settings.accountsFile || !this.settings.hledgerFolder) {
            console.log('No accounts file or Hledger folder specified');
            return;
        }

        try {
            const accountsPath = `${this.settings.hledgerFolder}/${this.settings.accountsFile}`;
            const file = this.app.vault.getAbstractFileByPath(accountsPath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                
                this.accounts = content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.startsWith('account '))
                    .map(line => {
                        const match = line.match(/^account\s+([^;]+)/);
                        return match ? match[1].trim() : null;
                    })
                    .filter((account): account is string => account !== null);
                
            } else {
                console.log('Accounts file not found:', accountsPath);
            }
        } catch (error) {
            console.error('Error loading accounts file:', error);
        }
    }

    private renderAccountEntries(container: HTMLElement) {
        container.empty();
        this.entries.forEach((entry, index) => {
            const entryDiv = container.createDiv('hledger-entry-row');
            
            const accountInput = entryDiv.createEl('input', {
                type: 'text',
                value: entry.account,
                placeholder: 'Account',
                cls: 'text-input hledger-account-input'
            });

            const showSuggestModal = () => {
                const suggestModal = new AccountSuggestModal(
                    this.app,
                    this.accounts,
                    (item: string) => {
                        entry.account = item;
                        accountInput.value = item;
                    }
                );
                suggestModal.open();
            };

            accountInput.addEventListener('click', showSuggestModal);
            accountInput.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                entry.account = target.value;
            });

            const amountInput = entryDiv.createEl('input', {
                type: 'number',
                value: entry.amount.toString(),
                placeholder: 'Amount',
                cls: 'text-input hledger-amount-input'
            });
            amountInput.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                entry.amount = parseFloat(target.value) || 0;
            });

            const currencySelect = entryDiv.createEl('select', {
                cls: 'dropdown hledger-currency-select'
            });
            this.settings.currencies.forEach(currency => {
                const option = currencySelect.createEl('option', {
                    text: currency,
                    value: currency
                });
                if (currency === entry.currency) {
                    option.selected = true;
                }
            });
            currencySelect.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                entry.currency = target.value;
            });

            if (this.entries.length > 1 && !this.isExchange) {
                const deleteButton = entryDiv.createEl('button', {
                    cls: 'clickable-icon hledger-delete-button'
                });
                const SVG_NS = "http://www.w3.org/2000/svg";

                const svgEl2 = document.createElementNS(SVG_NS, "svg");
                svgEl2.setAttribute("xmlns", SVG_NS);
                svgEl2.setAttribute("width", "24");
                svgEl2.setAttribute("height", "24");
                svgEl2.setAttribute("viewBox", "0 0 24 24");
                svgEl2.setAttribute("fill", "none");
                svgEl2.setAttribute("stroke", "currentColor");
                svgEl2.setAttribute("stroke-width", "2");
                svgEl2.setAttribute("stroke-linecap", "round");
                svgEl2.setAttribute("stroke-linejoin", "round");
                svgEl2.setAttribute("class", "svg-icon lucide-trash-2");

                const path1 = document.createElementNS(SVG_NS, "path");
                path1.setAttribute("d", "M3 6h18");
                svgEl2.appendChild(path1);

                const path2 = document.createElementNS(SVG_NS, "path");
                path2.setAttribute("d", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6");
                svgEl2.appendChild(path2);

                const path3 = document.createElementNS(SVG_NS, "path");
                path3.setAttribute("d", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2");
                svgEl2.appendChild(path3);

                const line1 = document.createElementNS(SVG_NS, "line");
                line1.setAttribute("x1", "10");
                line1.setAttribute("y1", "11");
                line1.setAttribute("x2", "10");
                line1.setAttribute("y2", "17");
                svgEl2.appendChild(line1);

                const line2 = document.createElementNS(SVG_NS, "line");
                line2.setAttribute("x1", "14");
                line2.setAttribute("y1", "11");
                line2.setAttribute("x2", "14");
                line2.setAttribute("y2", "17");
                svgEl2.appendChild(line2);

                deleteButton.empty();
                deleteButton.appendChild(svgEl2);
                deleteButton.addEventListener('click', () => {
                    this.entries.splice(index, 1);
                    this.renderAccountEntries(container);
                });
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 