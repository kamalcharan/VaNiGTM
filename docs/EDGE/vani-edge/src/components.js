import {escapeHTML as e} from './lib/model.js';
export const icon=(name)=>({arrow:'↗',next:'→',check:'✓',close:'×',spark:'✳',back:'←',file:'↥'}[name]||'◌');
export const button=(text,action,kind='primary',extra='')=>`<button class="btn ${kind}" data-action="${action}" ${extra}>${text}</button>`;
export const tag=(text,kind='')=>`<span class="tag ${kind}">${text}</span>`;
export const heading=(eyebrow,title,sub)=>`<div class="page-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${sub}</p></div>`;
export const field=(label,name,value,type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
export const orb=()=>'<span class="orb" aria-hidden="true"><i></i></span>';
export const note=(title,body)=>`<div class="vani-note">${orb()}<div><strong>${title}</strong><p>${body}</p></div></div>`;
export const map=(p,actual=false)=>`<div class="process-map" aria-label="${actual?'Observed sample':'Expected'} process"><div class="map-label"><span>${actual?'WHAT THE SAMPLE SHOWS':'THE EXPECTED FLOW'}</span><span>${actual?'One delay worth understanding':'Five connected steps'}</span></div><div class="nodes">${p.steps.map((s,i)=>`<div class="node ${actual&&i===3?'bottleneck':''}"><span class="node-icon">${['▤','◇','▧','◷','✓'][i]}</span><strong>${s}</strong><small>${actual&&i===3?(p.short==='P2P'?'10.2d receipt → approval':'8.4d in dispute'):'Step 0'+(i+1)}</small></div>${i<4?'<span class="connector" aria-hidden="true">→</span>':''}`).join('')}</div>${actual?'<div class="loop">↶ Exceptions return for clarification <span>Explore the evidence before drawing a conclusion</span></div>':''}</div>`;
