import {packs} from './domain.js';
function painAreas(m){return m.pains.length?m.pains:(m.painStory.trim()?['Your recent example']:[]);}
export function questions(m){const p=packs[m.process];return painAreas(m).map(pain=>({id:pain,title:p.follows[pain]?.[0]||'Tell us more about '+pain,options:p.follows[pain]?.[1]||['Explain below','Not sure'],pain}));}
export function hypotheses(m){return painAreas(m).map((pain,i)=>({id:'H'+(i+1),pain,text:m.process==='p2p'?({
 'Month-end invoice backlog':'Approval or receipt queues may contribute to the close backlog.',
 'Slow approvals':'Approval handoffs or missing information may be extending the cycle.',
 'Invoices without POs':'Some purchases may bypass the stated PO route.',
 'Late goods-receipt posting':'Receipt posting may be delaying invoice matching.',
 'Duplicate or wrong payments':'Duplicate candidates or incorrect amounts may pass existing checks.'
 }[pain]||pain+' may indicate a process or visibility gap.'):pain+' may contribute to the selected outcome gap.',
 answer:m.answers[pain]?.answer||'Awaiting an answer',status:'Needs evidence'}));}
export function blockers(m){const list=[];if(!m.respondent.name)list.push('Identify the respondent');if(!m.boardConfirmed)list.push('Confirm the reported process');if(!m.rulesConfirmed)list.push('Confirm rules and exceptions');packs[m.process].rules.forEach(([id,title])=>{if(!m.rules[id]?.trim()||['Needs confirmation','No defined rule'].includes(m.ruleStatus[id]))list.push('Rule to resolve: '+title);});if(m.mode!=='sample')list.push('Validate event mapping and analyse customer records');m.tasks.filter(t=>t.status!=='Resolved').forEach(t=>list.push('Awaiting '+t.assignee+': '+t.topic));return list;}
