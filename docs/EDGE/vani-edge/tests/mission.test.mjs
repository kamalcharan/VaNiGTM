import test from 'node:test';import assert from 'node:assert/strict';
import {createMission,seedBoard,removeNode} from '../src/mission/store.js';
import {questions,hypotheses,blockers} from '../src/mission/discovery.js';
import {packs} from '../src/mission/domain.js';import {missionBrief} from '../src/mission/brief.js';
test('each selected pain gets its own follow-up; no silent three-question cap',()=>{const m=createMission();m.pains=[...packs.p2p.pains];assert.equal(questions(m).length,8);assert.equal(hypotheses(m).length,8);});
test('removing an activity removes dangling links and invalidates confirmation',()=>{const m=createMission();seedBoard(m,packs.p2p.activities);m.boardConfirmed=true;removeNode(m,'n2');assert.ok(!m.links.some(l=>l.from==='n2'||l.to==='n2'));assert.equal(m.boardConfirmed,false);});
test('seeding a process preserves an already edited board',()=>{const m=createMission();seedBoard(m,['A','B']);m.board[0].label='Custom';seedBoard(m,['X']);assert.equal(m.board[0].label,'Custom');});
test('own-data mission remains evidence limited and exposes outstanding contributions',()=>{const m=createMission();m.tasks.push({assignee:'AP owner',topic:'Confirm delegation',status:'Awaiting response'});assert.ok(blockers(m).some(x=>x.includes('customer records')));assert.ok(blockers(m).some(x=>x.includes('Confirm delegation')));});
test('brief carries respondent, board, rules, goal and evidence provenance',()=>{const m=createMission();m.respondent.name='Test owner';m.goal='Faster close';m.rules.approval='CFO above limit';seedBoard(m,['Check invoice']);const b=missionBrief(m);for(const text of ['Test owner','Faster close','CFO above limit','Check invoice','Customer preparation'])assert.ok(b.includes(text));});

test('free-text pain receives a follow-up and a testable hypothesis',()=>{const m=createMission();m.painStory='Invoices sit in a shared mailbox';assert.equal(questions(m).length,1);assert.equal(hypotheses(m).length,1);});
test('confirming the rulebook does not hide unanswered rules',()=>{const m=createMission();m.rulesConfirmed=true;assert.equal(blockers(m).filter(x=>x.startsWith('Rule to resolve')).length,5);});
import {context,people,scope} from '../src/mission/views-context.js';
import {discovery} from '../src/mission/views-discovery.js';
import {boardView,rulesView} from '../src/mission/views-board.js';
import {evidenceView,mappingView} from '../src/mission/views-evidence.js';
import {explorer,findings,readiness,loadReference} from '../src/mission/views-intelligence.js';
import {readFile} from 'node:fs/promises';
test('guided mission screens render for both processes and evidence modes',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(new URL('../'+url,import.meta.url),'utf8'))});
 try {await loadReference();} finally {globalThis.fetch=oldFetch;}
 for(const process of ['p2p','o2c'])for(const mode of ['own','sample']){
  const m=createMission();Object.assign(m,{process,mode,pains:[packs[process].pains[0]],painStory:'A real example'});seedBoard(m,packs[process].activities);
  for(const view of [context,people,scope,boardView,rulesView,evidenceView,mappingView,explorer,findings,readiness]){const html=view(m);assert.ok(html.length>100);assert.ok(!html.includes('[object Object]'));}
  for(let quiz=0;quiz<4;quiz++){m.quiz=quiz;assert.ok(discovery(m).includes('understand'));}
  if(mode==='own')assert.ok(!readiness(m).includes('92 / 100'));
 }
});
import {coverage} from '../src/mission/pathways.js';
test('coverage excludes incomplete decisions and undisplayed routes',()=>{const m=createMission();m.mode='sample';const variants=[{id:'V1',share:38},{id:'V2',share:21}];m.pathReviews={V1:{classification:'Normal practice',explanation:'Verified example',owner:'Finance',fallback:'Manual queue',treatment:'Automate'},V2:{classification:'Legitimate exception',explanation:'Receipt missing',owner:'AP',fallback:'Review queue',treatment:'Automate with conditions'}};assert.deepEqual(coverage(m,variants),{automate:38,conditional:0,human:0,unresolved:62});m.pathReviews.V2.conditions='Require receipt before release';assert.equal(coverage(m,variants).conditional,21);assert.equal(coverage(m,variants).unresolved,41);m.mode='own';assert.equal(coverage(m,variants).automate,0);});
import {story,routeConclusion} from '../src/mission/story.js';
test('story carries goals, preserves evidence boundaries and escapes user content',()=>{const m=createMission();m.stage=11;m.goal='<script>unsafe</script>';m.mode='own';let html=story(m);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('evidence gaps'));assert.ok(!html.includes('100%'));m.stage=9;m.mode='sample';html=story(m,[]);assert.ok(html.includes('100% remain unresolved'));assert.ok(routeConclusion({treatment:'Automate with conditions',owner:'AP',fallback:'Queue'}).includes('Define the conditions'));});
test('every chapter has a narrative for P2P and O2C without missing values',()=>{for(const process of ['p2p','o2c']){const m=createMission();m.process=process;for(let stage=0;stage<12;stage++){m.stage=stage;const html=story(m);assert.ok(html.includes('EDGE /'));assert.ok(!html.includes('undefined'));}}});
import {radios} from '../src/mission/discovery-controls.js';
test('discovery shows guidance and visible answers without an assumed evidence basis',()=>{const m=createMission();m.pains=[packs.p2p.pains[0]];m.quiz=1;const html=discovery(m);assert.ok(html.includes('discovery-layout'));assert.ok(html.includes('Why I’m asking'));assert.ok(html.includes('type="radio" name="basis"'));assert.ok(!html.includes('<select name="basis"'));assert.ok(!radios('Basis','basis',['Experience','Estimate']).includes('checked'));m.quiz=0;assert.ok(!discovery(m).includes('Continue discovery'));});
import {strategyHTML,strategyView} from '../src/mission/strategy.js';
test('strategy delivers a bounded report and never implies live delivery',()=>{const m=createMission();m.company='<Unsafe>';m.delivery={email:'owner@example.com',preview:true};const html=strategyHTML(m,{variants:[]});assert.ok(html.includes('&lt;Unsafe&gt;'));for(const section of ['Executive decision','Execution roadmap','Measurement plan','PRELIMINARY STRATEGY'])assert.ok(html.includes(section));const view=strategyView(m,{variants:[]});assert.ok(view.includes('no email or WhatsApp message has been sent'));assert.ok(view.includes('owner@example.com'));assert.ok(!view.includes('sent on WhatsApp'));assert.ok(view.includes('Download Automation Strategy'));});

test('dispatch uses initial respondent details and removes the final delivery form',()=>{const m=createMission();m.respondent.email='leader@example.com';m.respondent.whatsapp='+919876543210';const view=strategyView(m,{variants:[]});assert.ok(view.includes('leader@example.com'));assert.ok(view.includes('+919876543210'));assert.ok(!view.includes('id="strategy-delivery"'));assert.ok(view.includes('Edit delivery details'));assert.ok(view.includes('preview'));});
import {incidentView,comparisonView,hypothesesView,actionsView,verificationView,failureReportView,failureHTML,failureText,missionEntry} from '../src/mission/failure.js';
test('failure journey renders independently and report retains investigation',()=>{const m=createMission();m.missionType='failure';m.failure.incident={title:'Duplicate payment',actual:'<unsafe>'};m.failure.hypotheses.push({id:'h1',statement:'Retry before acknowledgment',status:'Proposed'});m.failure.actions.push({id:'a1',title:'Review retry handling',hypothesis:'h1',status:'Verification pending',owner:'Payments'});for(const view of [incidentView,comparisonView,hypothesesView,actionsView,verificationView,failureReportView])assert.ok(view(m).length>100);const html=failureHTML(m);assert.ok(html.includes('Duplicate payment'));assert.ok(html.includes('&lt;unsafe&gt;'));assert.ok(html.includes('Verification pending'));assert.ok(failureText(m).includes('Retry before acknowledgment'));assert.ok(missionEntry(m).includes('Review what went wrong'));});
