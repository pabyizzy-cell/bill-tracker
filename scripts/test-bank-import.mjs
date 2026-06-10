// Unit checks for the bank CSV mapper. Run: node scripts/test-bank-import.mjs
import { mapBankCsv } from '../src/lib/bankImport.js';

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// --- Chase credit card format ---
const cardCsv = [
  'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
  '06/02/2026,06/03/2026,"STARBUCKS STORE 123, SEATTLE",Food & Drink,Sale,-7.45,',
  '06/01/2026,06/02/2026,WHOLEFDS MKT 10259,Groceries,Sale,-84.20,',
  '05/28/2026,05/29/2026,SHELL OIL 5742,Gas,Sale,-45.00,',
  '05/27/2026,05/28/2026,Payment Thank You-Mobile,,Payment,500.00,',
  '05/25/2026,05/26/2026,AMAZON RETURN,Shopping,Return,23.99,',
  '05/24/2026,05/25/2026,NETFLIX.COM,Bills & Utilities,Sale,-15.49,',
].join('\r\n');

const card = mapBankCsv(cardCsv);
check('card: format detected', card.format, 'Chase credit card');
check('card: payment row skipped as transfer', card.skippedTransfers, 1);
check('card: transaction count', card.transactions.length, 5);
const coffee = card.transactions[0];
check('card: quoted description with comma', coffee.description, 'STARBUCKS STORE 123, SEATTLE');
check('card: sale -> expense', coffee.type, 'expense');
check('card: amount in positive cents', coffee.amountCents, 745);
check('card: date converted', coffee.date, '2026-06-02');
check('card: Food & Drink -> dining', coffee.category, 'dining');
check('card: Groceries mapping', card.transactions[1].category, 'groceries');
check('card: Gas -> transport', card.transactions[2].category, 'transport');
check('card: refund -> income/other-income', [card.transactions[3].type, card.transactions[3].category], ['income', 'other-income']);
check('card: Bills & Utilities -> utilities', card.transactions[4].category, 'utilities');

// --- Chase checking format ---
const checkingCsv = [
  'Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #',
  'CREDIT,06/05/2026,"EPIC MOMENTS LLC DIRECT DEP PPD ID: 12345",2650.00,ACH_CREDIT,5200.10,',
  'DEBIT,06/04/2026,COMCAST CABLE COMM 800-266-2278,-89.99,ACH_DEBIT,2550.10,',
  'DEBIT,06/03/2026,CHASE CREDIT CRD AUTOPAY PPD ID: 4760039224,-500.00,ACH_DEBIT,2640.09,',
  'DEBIT,06/01/2026,ATM WITHDRAWAL 06/01 123 MAIN ST,-60.00,ATM,3140.09,',
].join('\n');

const checking = mapBankCsv(checkingCsv);
check('checking: format detected', checking.format, 'Chase checking account');
check('checking: autopay to card skipped', checking.skippedTransfers, 1);
check('checking: transaction count', checking.transactions.length, 3);
check('checking: direct deposit -> income/salary', [checking.transactions[0].type, checking.transactions[0].category], ['income', 'salary']);
check('checking: deposit cents', checking.transactions[0].amountCents, 265000);
check('checking: debit -> expense/other (no category column)', [checking.transactions[1].type, checking.transactions[1].category], ['expense', 'other']);

// --- Generic fallback + edge cases ---
const genericCsv = [
  'Date,Name,Amount',
  '2026-06-07,Refund from store,$12.00',
  '06/06/2026,Coffee shop,"(4.50)"',
  'not-a-date,Broken row,5.00',
].join('\n');

const generic = mapBankCsv(genericCsv);
check('generic: format fallback', generic.format, 'bank CSV');
check('generic: ISO date passes through', generic.transactions[0].date, '2026-06-07');
check('generic: parenthesized amount -> expense', [generic.transactions[1].type, generic.transactions[1].amountCents], ['expense', 450]);
check('generic: unreadable row counted', generic.skippedUnreadable, 1);

// --- Error cases ---
try {
  mapBankCsv('Foo,Bar\n1,2');
  failures++;
  console.error('FAIL unrecognized columns should throw');
} catch {
  console.log('ok   unrecognized columns throw a clear error');
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll bank import checks passed.');
