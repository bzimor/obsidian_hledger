import { App, Modal, TFile, FuzzySuggestModal, Notice } from 'obsidian';
import { HledgerSettings } from '../settings';
import moment from 'moment';

// Type definitions
interface Entry {
    account: string;
    amount: number;
    currency: string;
}

type EntryModalCallback = (date: string, description: string, entries: Entry[]) => void;

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
    entries: Entry[];
    onSubmit: EntryModalCallback;
    settings: HledgerSettings;
    accounts: string[] = [];
    isExchange: boolean;
    exchangeAmount: number | null;

    constructor(
        app: App,
        settings: HledgerSettings,
        onSubmit: EntryModalCallback
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        
        this.initializeDefaultValues();
    }

    private initializeDefaultValues(): void {
        this.setInitialDate();
        
        this.description = '';
        this.entries = [
            { account: '', amount: 0, currency: this.settings.currencies[0] },
            { account: '', amount: 0, currency: this.settings.currencies[0] }
        ];
        this.isExchange = false;
        this.exchangeAmount = null;
    }

    private setInitialDate(): void {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const basename = activeFile.basename.replace('.md', '');
            const dateFormat = this.settings.dailyNotesDateFormat.includes('/') 
                ? this.settings.dailyNotesDateFormat.split('/').pop() || this.settings.dailyNotesDateFormat
                : this.settings.dailyNotesDateFormat;
            const fileNameDate = moment(basename, dateFormat, true);
            if (fileNameDate.isValid()) {
                this.date = fileNameDate.format('YYYY-MM-DD');
            } else {
                this.date = moment().format('YYYY-MM-DD');
            }
        } else {
            this.date = moment().format('YYYY-MM-DD');
        }
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hledger-modal');

        await this.loadAccounts();

        this.createModalHeader(contentEl);
        this.createDescriptionInput(contentEl);
        
        const entriesContainer = contentEl.createDiv('hledger-entries-container');
        this.renderAccountEntries(entriesContainer);

        this.createModalButtons(contentEl, entriesContainer);
        this.setupKeyboardShortcuts(contentEl);
    }

    private createModalHeader(contentEl: HTMLElement): void {
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

        typeToggle.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.handleTypeToggle(target.value === 'exchange', contentEl);
        });
    }

    private createDescriptionInput(contentEl: HTMLElement): void {
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
        
        descriptionInput.focus();
    }

    private handleTypeToggle(isExchange: boolean, contentEl: HTMLElement): void {
        this.isExchange = isExchange;
        
        const entriesContainer = contentEl.querySelector('.hledger-entries-container') as HTMLElement;
        const leftButtons = contentEl.querySelector('.hledger-left-buttons') as HTMLElement;
        
        if (this.isExchange) {
            this.entries = [
                { account: '', amount: 0, currency: this.settings.currencies[0] },
                { account: '', amount: 0, currency: this.settings.currencies[1] }
            ];
            
            const addButton = leftButtons.querySelector('.hledger-add-account-button');
            if (addButton) {
                addButton.remove();
            }
        } else {
            this.entries = [
                { account: '', amount: 0, currency: this.settings.currencies[0] },
                { account: '', amount: 0, currency: this.settings.currencies[0] }
            ];
            
            if (!leftButtons.querySelector('.hledger-add-account-button')) {
                this.createAddButton(leftButtons, entriesContainer);
            }
        }
        
        this.renderAccountEntries(entriesContainer);
    }

    private createModalButtons(contentEl: HTMLElement, entriesContainer: HTMLElement): void {
        const buttonsContainer = contentEl.createDiv('hledger-buttons-container');
        const leftButtons = buttonsContainer.createDiv('hledger-left-buttons');
        
        if (!this.isExchange) {
            this.createAddButton(leftButtons, entriesContainer);
        }

        const submitButton = buttonsContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Submit'
        });
        submitButton.addEventListener('click', () => this.handleSubmit());
    }

    private createAddButton(container: HTMLElement, entriesContainer: HTMLElement): HTMLElement {
        const addAccountButton = container.createEl('button', {
            cls: 'hledger-add-account-button'
        });
        
        const svgEl = this.createSVGIcon('plus', 'M5 12h14', 'M12 5v14');
        addAccountButton.empty();
        addAccountButton.appendChild(svgEl);
        
        addAccountButton.addEventListener('click', () => {
            this.addNewEntry(entriesContainer);
        });
        
        return addAccountButton;
    }

    private addNewEntry(entriesContainer: HTMLElement): void {
        const lastEntry = this.entries[this.entries.length - 1];
        const totalAmount = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
        
        this.entries.push({
            account: '',
            amount: -totalAmount,
            currency: lastEntry.currency
        });
        
        this.renderAccountEntries(entriesContainer);
        
        setTimeout(() => {
            const newAccountInput = entriesContainer.querySelectorAll('.hledger-account-input');
            if (newAccountInput && newAccountInput.length > 0) {
                const lastAccountInput = newAccountInput[newAccountInput.length - 1] as HTMLInputElement;
                lastAccountInput.focus();
            }
        }, 10);
    }

    private createSVGIcon(iconName: string, ...pathData: string[]): SVGSVGElement {
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
        svgEl.setAttribute("class", `svg-icon lucide-${iconName}`);

        pathData.forEach(d => {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", d);
            svgEl.appendChild(path);
        });

        return svgEl;
    }

    private createTrashIcon(): SVGSVGElement {
        const svg = this.createSVGIcon(
            'trash-2',
            'M3 6h18', 
            'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
            'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'
        );
        
        const SVG_NS = "http://www.w3.org/2000/svg";
        
        const line1 = document.createElementNS(SVG_NS, "line");
        line1.setAttribute("x1", "10");
        line1.setAttribute("y1", "11");
        line1.setAttribute("x2", "10");
        line1.setAttribute("y2", "17");
        svg.appendChild(line1);

        const line2 = document.createElementNS(SVG_NS, "line");
        line2.setAttribute("x1", "14");
        line2.setAttribute("y1", "11");
        line2.setAttribute("x2", "14");
        line2.setAttribute("y2", "17");
        svg.appendChild(line2);
        
        return svg;
    }

    private setupKeyboardShortcuts(contentEl: HTMLElement): void {
        contentEl.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.handleSubmit();
            }
        });
    }

    private handleSubmit(): void {
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
            
            this.createAccountInput(entryDiv, entry, index, container);
            this.createAmountInput(entryDiv, entry, index, container);
            this.createCurrencySelect(entryDiv, entry);

            if (this.entries.length > 2 && !this.isExchange) {
                this.createDeleteButton(entryDiv, index, container);
            }
        });
    }

    private createAccountInput(entryDiv: HTMLElement, entry: Entry, index: number, container: HTMLElement): void {
        const accountInputContainer = entryDiv.createDiv('hledger-account-input-container');
        
        const accountInput = accountInputContainer.createEl('input', {
            type: 'text',
            value: entry.account,
            placeholder: 'Account',
            cls: 'text-input hledger-account-input'
        });

        const suggestContainer = accountInputContainer.createDiv('hledger-account-suggest-container');
        suggestContainer.style.display = 'none';
        
        this.setupAccountAutocomplete(accountInput, suggestContainer, entryDiv, entry);
    }

    private setupAccountAutocomplete(
        accountInput: HTMLInputElement, 
        suggestContainer: HTMLElement, 
        entryDiv: HTMLElement, 
        entry: Entry
    ): void {
        const showSuggestions = () => {
            const inputValue = accountInput.value.toLowerCase();
            if (!inputValue) {
                suggestContainer.style.display = 'none';
                return;
            }
            
            const matches = this.filterAndSortAccounts(inputValue);
            
            if (matches.length === 0) {
                suggestContainer.style.display = 'none';
                return;
            }
            
            this.displaySuggestions(matches, suggestContainer, accountInput, entryDiv, entry);
        };
        
        const selectSuggestion = (account: string) => {
            entry.account = account;
            accountInput.value = account;
            suggestContainer.style.display = 'none';
            
            const amountInput = entryDiv.querySelector('.hledger-amount-input') as HTMLInputElement;
            if (amountInput) {
                amountInput.focus();
            }
        };
        
        this.setupAccountAutocompleteEvents(accountInput, suggestContainer, showSuggestions, selectSuggestion);
        
        accountInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            entry.account = target.value;
        });
    }
    
    private filterAndSortAccounts(inputValue: string): string[] {
        return this.accounts
            .filter(account => account.toLowerCase().includes(inputValue))
            .sort((a, b) => {
                const aStartsWithInput = a.toLowerCase().startsWith(inputValue) ? 0 : 1;
                const bStartsWithInput = b.toLowerCase().startsWith(inputValue) ? 0 : 1;
                
                if (aStartsWithInput !== bStartsWithInput) {
                    return aStartsWithInput - bStartsWithInput;
                }
                
                const aIndex = a.toLowerCase().indexOf(inputValue);
                const bIndex = b.toLowerCase().indexOf(inputValue);
                if (aIndex !== bIndex) {
                    return aIndex - bIndex;
                }
                
                return a.length - b.length;
            })
            .slice(0, 10);
    }
    
    private displaySuggestions(
        matches: string[], 
        suggestContainer: HTMLElement, 
        accountInput: HTMLInputElement, 
        entryDiv: HTMLElement, 
        entry: Entry
    ): void {
        suggestContainer.empty();
        suggestContainer.style.display = 'block';
        
        const selectSuggestion = (account: string) => {
            entry.account = account;
            accountInput.value = account;
            suggestContainer.style.display = 'none';
            
            const amountInput = entryDiv.querySelector('.hledger-amount-input') as HTMLInputElement;
            if (amountInput) {
                amountInput.focus();
            }
        };
        
        matches.forEach((account, idx) => {
            const item = suggestContainer.createDiv({
                cls: idx === 0 ? 'hledger-account-suggest-item selected' : 'hledger-account-suggest-item'
            });
            item.textContent = account;
            
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectSuggestion(account);
            });
            
            item.addEventListener('touchend', (e) => {
                e.preventDefault();
                selectSuggestion(account);
            });
            
            item.addEventListener('mouseenter', () => {
                suggestContainer.querySelectorAll('.hledger-account-suggest-item').forEach(el => {
                    el.removeClass('selected');
                });
                item.addClass('selected');
            });
        });
    }

    private setupAccountAutocompleteEvents(
        accountInput: HTMLInputElement, 
        suggestContainer: HTMLElement, 
        showSuggestions: () => void, 
        selectSuggestion: (account: string) => void
    ): void {
        accountInput.addEventListener('keydown', (e) => {
            this.handleSuggestionKeyboardNavigation(e, suggestContainer, showSuggestions, selectSuggestion);
        });
        
        accountInput.addEventListener('input', showSuggestions);
        accountInput.addEventListener('focus', showSuggestions);
        
        accountInput.addEventListener('blur', (e) => {
            setTimeout(() => {
                if (!suggestContainer.contains(document.activeElement)) {
                    suggestContainer.style.display = 'none';
                }
            }, 300);
        });
        
        suggestContainer.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        
        suggestContainer.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
        
        accountInput.addEventListener('click', () => {
            if (!accountInput.value) {
                showSuggestions();
            }
        });
    }

    private handleSuggestionKeyboardNavigation(
        e: KeyboardEvent, 
        suggestContainer: HTMLElement, 
        showSuggestions: () => void, 
        selectSuggestion: (account: string) => void
    ): void {
        if (suggestContainer.style.display === 'none') {
            if (e.key === 'ArrowDown') {
                showSuggestions();
                e.preventDefault();
            }
            return;
        }
        
        const items = suggestContainer.querySelectorAll('.hledger-account-suggest-item');
        const selectedItem = suggestContainer.querySelector('.selected') as HTMLElement;
        let selectedIndex = Array.from(items).indexOf(selectedItem);
        
        switch (e.key) {
            case 'ArrowDown':
                if (selectedIndex < items.length - 1) {
                    items[selectedIndex].removeClass('selected');
                    items[selectedIndex + 1].addClass('selected');
                    
                    const nextItem = items[selectedIndex + 1] as HTMLElement;
                    const containerRect = suggestContainer.getBoundingClientRect();
                    const itemRect = nextItem.getBoundingClientRect();
                    
                    if (itemRect.bottom > containerRect.bottom) {
                        suggestContainer.scrollTop += (itemRect.bottom - containerRect.bottom);
                    }
                }
                e.preventDefault();
                break;
            case 'ArrowUp':
                if (selectedIndex > 0) {
                    items[selectedIndex].removeClass('selected');
                    items[selectedIndex - 1].addClass('selected');
                    
                    const prevItem = items[selectedIndex - 1] as HTMLElement;
                    const containerRect = suggestContainer.getBoundingClientRect();
                    const itemRect = prevItem.getBoundingClientRect();
                    
                    if (itemRect.top < containerRect.top) {
                        suggestContainer.scrollTop -= (containerRect.top - itemRect.top);
                    }
                }
                e.preventDefault();
                break;
            case 'Enter':
                if (selectedItem) {
                    selectSuggestion(selectedItem.textContent || '');
                    e.preventDefault();
                }
                break;
            case 'Escape':
                suggestContainer.style.display = 'none';
                e.preventDefault();
                break;
        }
    }

    private createAmountInput(entryDiv: HTMLElement, entry: Entry, index: number, container: HTMLElement): void {
        const amountInput = entryDiv.createEl('input', {
            type: 'text',
            value: entry.amount ? entry.amount.toString(): '',
            placeholder: 'Amount',
            cls: 'text-input hledger-amount-input'
        });
        
        amountInput.addEventListener('change', (e) => {
            this.handleAmountChange(e, entry, index, container);
        });
    }
    
    private handleAmountChange(e: Event, entry: Entry, index: number, container: HTMLElement): void {
        const target = e.target as HTMLInputElement;
        let value = target.value.trim();
        
        value = this.processAmountValue(value, entry, target);
        
        if (index === 0 && this.entries.length === 2 && !this.isExchange) {
            this.updateSecondRowAmount(entry.amount, container);
        }
    }
    
    private processAmountValue(value: string, entry: Entry, inputElement: HTMLInputElement): string {
        let suffix = '';
        if (value.toLowerCase().endsWith('k')) {
            suffix = 'k';
            value = value.slice(0, -1);
        } else if (value.toLowerCase().endsWith('m')) {
            suffix = 'm';
            value = value.slice(0, -1);
        }
        
        value = value.replace(/[^\d.-]/g, '');
        value = value + suffix;
        
        if (value.toLowerCase().endsWith('k')) {
            value = value.slice(0, -1);
            entry.amount = (parseFloat(value) || 0) * 1000;
            inputElement.value = entry.amount.toString();
        } else if (value.toLowerCase().endsWith('m')) {
            value = value.slice(0, -1);
            entry.amount = (parseFloat(value) || 0) * 1000000;
            inputElement.value = entry.amount.toString();
        } else {
            entry.amount = parseFloat(value) || 0;
            inputElement.value = entry.amount.toString();
        }
        
        return value;
    }
    
    private updateSecondRowAmount(firstRowAmount: number, container: HTMLElement): void {
        const secondRow = this.entries[1];
        const secondAmountInput = container.querySelectorAll('.hledger-amount-input')[1] as HTMLInputElement;
        
        if (!secondRow.amount && secondAmountInput && (secondAmountInput.value === '' || secondAmountInput.value === '0')) {
            secondRow.amount = -firstRowAmount;
            secondAmountInput.value = secondRow.amount.toString();
        }
    }

    private createCurrencySelect(entryDiv: HTMLElement, entry: Entry): void {
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
    }

    private createDeleteButton(entryDiv: HTMLElement, index: number, container: HTMLElement): void {
        const deleteButton = entryDiv.createEl('button', {
            cls: 'clickable-icon hledger-delete-button'
        });
        
        const trashIcon = this.createTrashIcon();
        deleteButton.empty();
        deleteButton.appendChild(trashIcon);
        
        deleteButton.addEventListener('click', () => {
            this.entries.splice(index, 1);
            this.renderAccountEntries(container);
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
