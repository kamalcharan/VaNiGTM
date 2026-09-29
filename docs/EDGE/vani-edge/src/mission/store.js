const KEY='vani-edge-mission-v2';
export function createMission(){return {
 missionType:'readiness',failure:{incident:{},comparison:{},hypotheses:[],actions:[],verification:{}},version:2,stage:-1,furthest:0,process:'p2p',company:'Meridian Pharma Distributors',industry:'Pharma & distribution',
 profileSource:'Illustrative inherited ICP profile',locations:'6 depots',icpConfirmed:false,role:'',goal:'',
 respondent:{name:'',designation:'',role:'Process owner',scope:''},actors:[],tasks:[],pains:[],priority:'',answers:{},gains:[],
 current:'',target:'',unit:'working days',deadline:'',painStory:'',frequency:'',impact:'',quiz:0,discoveryConfirmed:false,
 board:[],links:[],boardConfirmed:false,rules:{},ruleStatus:{},stack:[],systemNotes:'',rulesConfirmed:false,
 mode:'own',files:[],mapping:{},evidenceConfirmed:false,lens:'frequency',variant:'',selectedNode:'',
 pathReviews:{},resolutions:{},context:'',confirmed:false,control:'guarded',
 assumptions:{volume:4213,minutes:12,rate:500,coverage:60,efficiency:50,setup:150000,monthly:15000},
 chat:[],savedAt:null,storage:false,usage:'available',topup:false
};}
export function loadMission(){try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);if(saved.version===2)return {...createMission(),...saved,files:(saved.files||[]).map(f=>({...f,needsReattach:true}))};}}catch{}return createMission();}
export const mission=loadMission();
export function saveMission(){if(!mission.storage)return false;try{mission.savedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(mission));return true;}catch{return false;}}
export function clearMission(){localStorage.removeItem(KEY);Object.keys(mission).forEach(k=>delete mission[k]);Object.assign(mission,createMission());}
export function switchProcess(id){if(id===mission.process)return;const keep={missionType:mission.missionType,company:mission.company,industry:mission.industry,locations:mission.locations,profileSource:mission.profileSource,icpConfirmed:mission.icpConfirmed,respondent:mission.respondent,actors:mission.actors,storage:mission.storage};Object.assign(mission,createMission(),keep,{process:id,stage:2,furthest:2});mission.assumptions.volume=id==='p2p'?4213:1800;mission.assumptions.minutes=id==='p2p'?12:15;}
export function seedBoard(m,activities){if(m.board.length)return;m.board=activities.map((label,i)=>({id:'n'+i,label,actor:'',system:'',input:'',output:'',rule:'',type:'activity',x:50+(i%3)*245,y:40+Math.floor(i/3)*150}));m.links=m.board.slice(1).map((n,i)=>({from:m.board[i].id,to:n.id,label:'Next',kind:'normal'}));}
export function removeNode(m,id){m.board=m.board.filter(n=>n.id!==id);m.links=m.links.filter(l=>l.from!==id&&l.to!==id);m.boardConfirmed=false;}
