import test from 'node:test';import assert from 'node:assert/strict';import {parseCSV,estimate,escapeHTML} from '../src/lib/model.js';
test('CSV handles quoted commas, escaped quotes, multiline cells and CRLF',()=>{const r=parseCSV('ID,Description\r\n1,"Goods, received"\r\n2,"A ""quoted""\nvalue"\r\n');assert.equal(r.rows,2);assert.equal(r.inconsistent,0);assert.deepEqual(r.headers,['ID','Description']);});
test('CSV rejects unfinished quoted fields and header-only files',()=>{assert.throws(()=>parseCSV('a,b\n1,"bad'));assert.throws(()=>parseCSV('a,b\n'));});
test('CSV flags uneven rows and strips BOM',()=>{const r=parseCSV('\uFEFFA,B\n1,2,3');assert.equal(r.headers[0],'A');assert.equal(r.inconsistent,1);});
test('capacity excludes ineligible effort and subtracts recurring costs',()=>{const r=estimate({volume:1000,minutes:12,rate:500,coverage:50,efficiency:50,setup:100000,monthly:5000});assert.equal(r.freed,50);assert.equal(r.value,25000);assert.equal(r.net,20000);assert.equal(r.breakeven,5);});
test('zero realised value has no recovery claim',()=>{assert.equal(estimate({volume:100,minutes:0,rate:100,coverage:100,efficiency:100,setup:1000,monthly:100}).breakeven,null);});
test('HTML interpolation is escaped',()=>assert.equal(escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;'));
