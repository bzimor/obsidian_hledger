<%* 
// constants for hledger
const default_commodity = "USD";
const hledger_folder = "Hledger"
const hledger_accounts_filename = "accounts.md"
const hledger_accounts_file_path = hledger_folder + "/" + hledger_accounts_filename
// used for formatting transaction line
const default_transaction_line_width = 70;
var account_data_list = [];

async function get_account_list() {
    if (!tp.file.exists(hledger_accounts_file_path)) {
        new tp.obsidian.Notice(
            `*FileNotFoundError:*
            Hledger Accounts file is not found`);
        return;    
    }
    var accounts_content = await this.app.vault.adapter.read(hledger_accounts_file_path);
    var accounts = [];
    var lines = accounts_content.split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("account")) {
            var account_name = lines[i].replace("account ", "");
            if (account_name.split(";").length > 1) {
                account_name = account_name.split(";")[0]
            }
            accounts.push(account_name.trim());
        }
    }
	console.log(accounts);
    return accounts;
}


function get_currency_symbol(input_amount) {
    //replace all numbers, spaces, commas, and periods with an empty string
    //we should only be left with the currency symbols
    return input_amount.replace(/[\d\., -]/g, "");
}


function format_amount_as_currency(amount, currency_symbol) {
    amount = amount.toString().replace(",","");
    return parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, "$&,") + " " + currency_symbol;
}


function wrap_transaction(transaction) {
    if (tp.file.folder() == hledger_folder) {
        return transaction + "\n";
    }
    return "```\n" + transaction + "```\n"
}


function get_default_date() {
    // parse title of current file, if it is date (i.e daily note), return that title, otherwise return today
    if (tp.file.folder() == hledger_folder || isNaN(Date.parse(tp.file.title))) {
        return tp.date.now();
    }
    return tp.file.title;
}


function parse_amount(amount) {
    var currency_symbol = get_currency_symbol(amount);
    // if no commmodity added to amount, or it is written as shortcut, return it with default commmodity
    if (currency_symbol.length == 0 || ["k", "m"].includes(currency_symbol)) {
        // if amount is written as shortcut e.g. 10k, it should be parsed as 1000
        if (currency_symbol == "k") {
            amount = amount.replace("k", "000");
        } else if (currency_symbol == "m") {
            amount = amount.replace("m", "000000");
        }
        return format_amount_as_currency(amount, default_commodity);
    }    
    return format_amount_as_currency(amount, currency_symbol);
}


function build_account_line(account, amount) {
    amount = parse_amount(amount);
    padding_length = default_transaction_line_width - 4 - amount.length;
    return "    " + account.padEnd(padding_length, " ") + amount + "\n";
}


function build_transaction(transaction_date, description) {
    var result = transaction_date + " " + description + "\n";
    for (var i = 0; i < account_data_list.length; i++) {
        result += build_account_line(account_data_list[i].account, account_data_list[i].amount);
    }
    return result
}


function get_default_amount() {
    if (account_data_list.length == 0) {
        return "";
    }
    if (account_data_list.length == 1) {
        return "-" + account_data_list[0].amount;
    }
    else {
        var amount = 0;
        for (var i = 0; i < account_data_list.length; i++) {
            var old_amount = account_data_list[i].amount.replace(",", "");
            amount += parseFloat(old_amount);
        }
		if (amount == 0) {
		    return "";
		}
        var currency_symbol = get_currency_symbol(account_data_list[0].amount);
        amount = format_amount_as_currency(amount, currency_symbol);
        return "-" + amount;
    }
}


async function prompt_account_entry(account_num, account_list) {
    account_placeholder = "Account " + account_num;
    amount_placeholder = "Amount " + account_num;
    var account = await tp.system.suggester(items = accounts_list, text_items = accounts_list, limit = 10, placeholder = account_placeholder, throw_on_cancel=true);
    default_amount = get_default_amount();
    var amount = NaN;
    var is_wrong = false;
    while (isNaN(parseFloat(amount))) {
        if (!is_wrong) {
            is_wrong = true;
        }
        else {
            amount_placeholder = "Wrong amount " + account_num + ", try again";
        }
        amount = await tp.system.prompt(amount_placeholder, default_amount, throw_on_cancel=true);
        
    }
    amount = parse_amount(amount);
    var account_data = {"account": account, "amount": amount};
    account_data_list.push(account_data);
}

async function account_prompt_iterator(counter, account_list) {
    counter++;
    await prompt_account_entry(counter, account_list);
    if (counter < 2) {
        return await account_prompt_iterator(counter, account_list);
    }
    var more = await tp.system.prompt("Continue? (y/n)", "y");
    if (more == "y") {
        await account_prompt_iterator(counter, account_list);
    }
}


var accounts_list = await get_account_list();
var counter = 0;
var default_date = get_default_date();
var transaction_date = await tp.system.prompt("Date", default_date, throw_on_cancel=true);
var description = await tp.system.prompt("Description", "", throw_on_cancel=true);
await account_prompt_iterator(counter, accounts_list);
if (account_data_list.length > 0) {
    transaction = build_transaction(transaction_date, description);
    transaction = wrap_transaction(transaction);
    tR += transaction;
}
%>