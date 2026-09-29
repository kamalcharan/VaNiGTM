import test from 'node:test';
import assert from 'node:assert/strict';
import {createMission,seedBoard} from '../src/mission/store.js';
import {strategyHTML} from '../src/mission/strategy.js';
test('visual report keeps declared branches and excludes reference routes in own mode',()=>{
 const m=createMission();seedBoard(m,['Receive','Approve','Correct']);m.links.push({from:'n2',to:'n0',kind:'exception',label:'Return & retry'});
 m.pains=['Slow approvals'];const before=JSON.stringify(m);
 const html=strategyHTML(m,{variants:[{id:'v',label:'SAMPLE ONLY ROUTE',share:30}]});
 assert.ok(html.includes('Return &amp; retry'));assert.ok(html.includes('stroke-dasharray'));
 assert.ok(!html.includes('SAMPLE ONLY ROUTE'));assert.ok(html.includes('Customer pathway coverage'));
 assert.ok(html.includes('Approval handoffs'));assert.ok(html.includes('@media print'));
 assert.equal(JSON.stringify(m),before);
});
test('sample report retains coverage boundaries and linked corrections',()=>{
 const m=createMission();m.mode='sample';m.failure.hypotheses=[{id:'h1',statement:'<Retry>',status:'Proposed'}];
 m.failure.actions=[{hypothesis:'h1',title:'Check retry log',owner:'AP',status:'Pending'}];
 const html=strategyHTML(m,{variants:[{id:'v',label:'Sample route',share:30}]});
 assert.ok(html.includes('Unresolved: 100%'));assert.ok(html.includes('&lt;Retry&gt;'));assert.ok(html.includes('Check retry log'));
 assert.ok(html.includes('Sample route'));assert.ok(!html.includes('src="http'));
});
