'use strict';
/* ============================================================= data ===== */
const DATA = JSON.parse(document.getElementById('wc-data').textContent);
const M = DATA.matches;
const APP = document.getElementById('app');
const TT = document.getElementById('tt');

/* short helpers */
const $ = (s,r=document)=>r.querySelector(s);
const h = (html)=>{const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild;};
const num = (v,d=0)=> (v==null?'—':(+v).toFixed(d));
const pct = v=> Math.round(v)+'%';
const esc = s=> String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cssv = n=> getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* pitch geometry (provider 0-100 x / 0-100 y -> svg 100 x 65) */
const PW=100, PH=65, YK=0.65;
const HX=12, HY=8;                     // heat / xT grid dims (must match the ETL)
const PX = x=> x;
/* the provider's y runs 0-100 across the pitch with **0 on the attacking team's RIGHT**
   (verified against players whose flank is known: Cucurella 85.6, Yamal 16.3).
   Viewed from above with the attack going left->right, the left flank belongs at the
   TOP of the image, so y must be inverted on the way to SVG — otherwise every pitch
   graphic is a vertical mirror of reality and right-wingers appear on the left. */
const PY = y=> (100-y)*YK;

/* team colour by side */
const COL = side=> cssv(side==='home'?'--home':'--away');

/* nation badge — a ruled monogram, no colour (the palette is absolute) */
function teamBadge(code){ return `<span class="badge">${esc(code||'?')}</span>`; }

/* ============================================== aggregations (once) ===== */
const AGG = (()=>{
  const players={}, teams={};
  M.forEach(m=>{
    ['home','away'].forEach(side=>{
      const t=m[side], ts=m.teamStats[side], tc=(m.tactical||{})[side]||{},
        oppTs=m.teamStats[side==='home'?'away':'home'];
      const T = teams[t.id] || (teams[t.id]={id:t.id,name:t.name,code:t.code,mp:0,w:0,d:0,l:0,
        gf:0,ga:0,xg:0,xga:0,shots:0,sot:0,poss:0,prog:0,ft3:0,tk:0,intc:0,rec:0,aer:0,aerW:0,
        ppda:0,defH:0,longp:0,tilt:0,tempo:0,spxg:0,opxg:0,aL:0,aC:0,aR:0,passpct:0,
        xtF:0,xtA:0});
      const xtm=m.xt||{};
      T.xtF+=xtm[side]||0; T.xtA+=xtm[side==='home'?'away':'home']||0;
      T.mp++; T.xg+=ts.xg; T.xga+=oppTs.xg; T.shots+=ts.shots; T.sot+=ts.sot; T.poss+=ts.possession;
      T.prog+=ts.prog_pass; T.ft3+=ts.final_third; T.tk+=ts.tackle; T.intc+=ts.interception;
      T.rec+=ts.recovery; T.aer+=ts.aerial; T.aerW+=ts.aerial_ok; T.passpct+=ts.pass_pct;
      T.ppda+=tc.ppda||0; T.defH+=tc.def_height||0; T.longp+=tc.long_pct||0; T.tilt+=tc.field_tilt||0;
      T.tempo+=tc.tempo||0; T.spxg+=tc.sp_xg||0; T.opxg+=tc.op_xg||0;
      T.aL+=tc.att_left||0; T.aC+=tc.att_center||0; T.aR+=tc.att_right||0;
      const gf=m.score.ft[side==='home'?0:1], ga=m.score.ft[side==='home'?1:0];
      T.gf+=gf; T.ga+=ga;
      if(gf>ga)T.w++; else if(gf<ga)T.l++; else T.d++;
      m.players[side].forEach(p=>{
        const P=players[p.id]||(players[p.id]={id:p.id,name:p.name,team:t.name,teamId:t.id,code:t.code,
          group:'SUB',mp:0,min:0,goals:0,shots:0,xg:0,npg:0,npxg:0,xa:0,xt:0,xtc:0,xtp:0,carries:0,passes:0,passOk:0,prog:0,
          tackles:0,intercept:0,recov:0,clear:0,dribbles:0,aerials:0,saves:0,fouls:0});
        P.mp++; P.min+=p.min||0; P.goals+=p.goals; P.shots+=p.shots; P.xg+=p.xg;
        P.npg+=(p.npg||0); P.npxg+=(p.npxg||0); P.xa+=(p.xa||0); P.xt+=(p.xt||0);
        P.xtc+=(p.xtc||0); P.xtp+=(p.xtp||0); P.carries+=(p.carries||0);
        P.passes+=p.passes; P.passOk+=(p.pass_ok||0); P.prog+=p.prog; P.tackles+=p.tackles;
        P.intercept+=p.intercept; P.recov+=p.recov; P.clear+=(p.clear||0); P.dribbles+=p.dribbles;
        P.aerials+=(p.aerials||0); P.saves+=p.saves; P.fouls+=(p.fouls||0);
        // every appearance now carries a canonical position (the ETL infers one from
        // average touch position for players who never start), so this no longer has
        // to wait for a start — which used to leave 254 players stuck on 'SUB'
        if(p.group && p.group!=='SUB' && P.group==='SUB') P.group=p.group;
      });
    });
  });
  Object.values(teams).forEach(T=>{const n=T.mp||1;
    T.gd=T.gf-T.ga; T.poss=T.poss/n;
    T.tac={ poss:T.poss, ppda:T.ppda/n, defH:T.defH/n, longp:T.longp/n, tilt:T.tilt/n,
      tempo:T.tempo/n, passpct:T.passpct/n, xgpg:T.xg/n, xgapg:T.xga/n, shotspg:T.shots/n,
      sotpg:T.sot/n, progpg:T.prog/n, ft3pg:T.ft3/n, defactpg:(T.tk+T.intc)/n,
      aerpct:T.aer?100*T.aerW/T.aer:0, spshare:(T.spxg+T.opxg)?100*T.spxg/(T.spxg+T.opxg):0,
      aL:T.aL/n, aC:T.aC/n, aR:T.aR/n, xtpg:T.xtF/n, xtapg:T.xtA/n };
  });
  // xT prevented = how far below the field's average xT conceded a team keeps opponents
  const tl=Object.values(teams);
  const avgConc = tl.reduce((a,t)=>a+t.tac.xtapg,0)/(tl.length||1);
  tl.forEach(T=>{ T.tac.xtprev = avgConc - T.tac.xtapg; T.tac.xtnet = T.tac.xtpg - T.tac.xtapg; });

  // group standings (group stage only): W/D/L, GF/GA, Pts per team per group
  const groups={};
  M.filter(m=>m.stage==='Group Stage'&&m.group).forEach(m=>{
    const g=groups[m.group]||(groups[m.group]={});
    [['home',0,1],['away',1,0]].forEach(([side,gi,oi])=>{
      const t=m[side];
      const R=g[t.id]||(g[t.id]={id:t.id,name:t.name,code:t.code,mp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
      const gf=m.score.ft[gi], ga=m.score.ft[oi];
      R.mp++; R.gf+=gf; R.ga+=ga;
      if(gf>ga){R.w++;R.pts+=3;} else if(gf<ga){R.l++;} else {R.d++;R.pts+=1;}
    });
  });
  const standings={};
  Object.entries(groups).forEach(([g,tbl])=>{
    standings[g]=Object.values(tbl).map(r=>({...r,gd:r.gf-r.ga}))
      .sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));
  });
  return {players:Object.values(players), teams:Object.values(teams), standings};
})();

/* stage ordering + helpers */
const STAGE_ORDER=['Group Stage','16th Finals','8th Finals','Quarter-finals','Semi-finals','3rd Place Final','Final'];
const STAGE_LABEL={'16th Finals':'Round of 32','8th Finals':'Round of 16',
  'Quarter-finals':'Quarter-finals','Semi-finals':'Semi-finals','3rd Place Final':'Third-place play-off',
  'Final':'Final','Group Stage':'Group Stage'};
const FINAL_M = ()=> M.find(m=>m.stage==='Final');
const THIRD_M = ()=> M.find(m=>m.stage==='3rd Place Final');
/* the tournament is complete once the final has been played */
const CHAMPION = ()=>{ const f=FINAL_M(); return f?winnerName(f):null; };
const idxOf = m=> M.indexOf(m);
const winnerName = m=> m.winner==='home'?m.home.name : m.winner==='away'?m.away.name : null;

/* ---- tactical percentiles (team style vs the 48-team field) ---- */
const TAC_ARR={};
['poss','ppda','defH','longp','tilt','tempo','xgpg','xgapg','shotspg','progpg','defactpg','aerpct','spshare','sotpg','xtpg','xtapg','xtprev']
  .forEach(k=>TAC_ARR[k]=AGG.teams.map(t=>t.tac[k]).sort((a,b)=>a-b));
function tacPct(k,v,dir){ const arr=TAC_ARR[k]; const n=arr.length; if(n<2)return 50;
  let worse=0; arr.forEach(x=>{ if(dir>0? x<v : x>v) worse++; }); return Math.round(100*worse/(n-1)); }
// style radar axes: dir +1 = higher value → further out; -1 = lower value → further out
const STYLE_AXES=[
  {k:'poss', label:'Possession', dir:1,  fmt:v=>v.toFixed(0)+'%'},
  {k:'ppda', label:'Pressing',   dir:-1, fmt:v=>v.toFixed(1)+' PPDA'},
  {k:'defH', label:'High line',  dir:1,  fmt:v=>v.toFixed(0)},
  {k:'tempo',label:'Tempo',      dir:1,  fmt:v=>v.toFixed(1)+'/min'},
  {k:'longp',label:'Directness', dir:1,  fmt:v=>v.toFixed(1)+'%'},
  {k:'tilt', label:'Field tilt', dir:1,  fmt:v=>v.toFixed(0)+'%'},
];

/* ---- per-90 helper for players ---- */
const per90 = (v,min)=> min>0 ? v/(min/90) : 0;
const POS_ORDER={GK:0,DEF:1,MID:2,FWD:3,SUB:4};

/* ---- style radar (team percentiles vs field) ---- */
function styleRadar(T){
  const cx=50,cy=50,R=34, N=STYLE_AXES.length, col=cssv('--fg');
  const pt=(i,r)=>{const a=(-90+i*360/N)*Math.PI/180; return [cx+r*Math.cos(a), cy+r*Math.sin(a)];};
  let grid='';
  [.25,.5,.75,1].forEach(f=>{
    const pts=STYLE_AXES.map((_,i)=>pt(i,R*f).map(v=>v.toFixed(1)).join(',')).join(' ');
    grid+=`<polygon points="${pts}" fill="none" stroke="${cssv('--grid')}" stroke-width="${f===.5?'.4':'.25'}" ${f===.5?'stroke-dasharray="1 1"':''}/>`;
  });
  let axes='',labels='';
  const vals=STYLE_AXES.map(ax=>tacPct(ax.k,T.tac[ax.k],ax.dir));
  STYLE_AXES.forEach((ax,i)=>{
    const [ex,ey]=pt(i,R); axes+=`<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${cssv('--grid')}" stroke-width=".25"/>`;
    const [lx,ly]=pt(i,R+8); const anchor=Math.abs(lx-cx)<3?'middle':(lx>cx?'start':'end');
    labels+=`<text x="${lx}" y="${ly}" font-size="3.4" font-weight="700" text-anchor="${anchor}" fill="${cssv('--ink-2')}">${ax.label}</text>
      <text x="${lx}" y="${ly+3.6}" font-size="2.9" text-anchor="${anchor}" fill="${cssv('--muted')}">${ax.fmt(T.tac[ax.k])}</text>`;
  });
  const poly=STYLE_AXES.map((_,i)=>pt(i,R*vals[i]/100).map(v=>v.toFixed(1)).join(',')).join(' ');
  const dots=STYLE_AXES.map((_,i)=>{const[px,py]=pt(i,R*vals[i]/100);return `<circle cx="${px}" cy="${py}" r="1" fill="${col}"/>`;}).join('');
  const inner=`${grid}${axes}<polygon points="${poly}" fill="${col}" fill-opacity=".2" stroke="${col}" stroke-width=".8"/>${dots}${labels}`;
  return svgEl(`-14 -6 128 112`, inner, 'style="overflow:visible"');
}

function styleTags(T){
  const p=(k,dir)=>tacPct(k,T.tac[k],dir); const tags=[];
  const poss=p('poss',1),press=p('ppda',-1),line=p('defH',1),direct=p('longp',1),
    tilt=p('tilt',1),sp=p('spshare',1),solid=p('xgapg',-1),tempo=p('tempo',1),att=p('xgpg',1);
  if(poss>=72)tags.push('Possession-based'); else if(poss<=28)tags.push('Low possession');
  if(press>=72)tags.push('High press'); else if(press<=28)tags.push('Passive press');
  if(line>=72)tags.push('High line'); else if(line<=25)tags.push('Deep block');
  if(direct>=72)tags.push('Direct'); if(tilt>=78)tags.push('Territorial');
  if(tempo>=80)tags.push('Quick tempo');
  if(att>=78)tags.push('Attacking threat'); if(solid>=78)tags.push('Defensively solid');
  if(sp>=80)tags.push('Set-piece threat');
  const {aL,aC,aR}=T.tac;
  if(aL-aR>=8)tags.push('Left-sided'); else if(aR-aL>=8)tags.push('Right-sided');
  return tags.slice(0,7);
}

/* average heat map + xT panel for a team's whole campaign */
function teamAvgHeat(T){
  const g=new Array(HX*HY).fill(0);
  M.forEach(m=>['home','away'].forEach(s=>{
    if(m[s].id!==T.id) return;
    const hh=(m.heat&&m.heat[s])||[];
    for(let i=0;i<g.length&&i<hh.length;i++) g[i]+=hh[i];
  }));
  return g;
}
/* per-zone xT grids: where a team adds threat from, and where it concedes it */
function teamXtz(T,which){
  const g=new Array(HX*HY).fill(0);
  M.forEach(m=>['home','away'].forEach(s=>{
    if(m[s].id!==T.id) return;
    const src=(m.xtz||{})[which==='created'?s:(s==='home'?'away':'home')]||[];
    for(let i=0;i<g.length&&i<src.length;i++) g[i]+=src[i];
  }));
  return g.map(v=>v/(T.mp||1));                 // per match
}
const FIELD_XTZ=(()=>{                          // average xT conceded per team-match
  const g=new Array(HX*HY).fill(0); let n=0;
  M.forEach(m=>['home','away'].forEach(s=>{
    const src=(m.xtz||{})[s]||[]; n++;
    for(let i=0;i<g.length&&i<src.length;i++) g[i]+=src[i];
  }));
  return g.map(v=>v/(n||1));
})();
const TMAPS=[['heat','Heat map'],['created','xT created'],['conceded','xT conceded'],['prevented','xT prevented']];

function teamSpatial(T){
  const wrap=h(`<div class="card pad"></div>`);
  const cols=h(`<div style="display:grid;grid-template-columns:1.25fr 1fr;gap:22px" class="two-col"></div>`);
  const left=h(`<div></div>`);
  const tabs=h(`<div class="subtabs" style="margin-bottom:12px"></div>`);
  TMAPS.forEach(([k,l])=>{const b=h(`<button class="${state.tmap===k?'on':''}">${l}</button>`);
    b.onclick=()=>{state.tmap=k; render();}; tabs.append(b);});
  left.append(tabs);

  let grid, col, opts={}, cap1, note;
  // xT lives on a 12x8 lattice, so its maps are drawn as that lattice — ruled cells,
  // no blur, exact value on hover. Only the touch map (a true density) stays smoothed.
  if(state.tmap==='created'){
    grid=teamXtz(T,'created'); col=cssv('--cat-att'); opts={gamma:0.85,grid:true,ttl:'xT created per match'};
    cap1=`xT created per match`;
    note=`Threat <b>${esc(T.name)}</b> generate, mapped to the zone each pass or carry was played <i>from</i>. Hover any cell for its exact value.`;
  } else if(state.tmap==='conceded'){
    grid=teamXtz(T,'conceded'); col=cssv('--fg'); opts={gamma:0.85,grid:true,ttl:'xT conceded per match'};
    cap1=`xT conceded per match`;
    note=`Threat <b>opponents</b> generate against ${esc(T.name)}, by the zone they played from — where this side is opened up. Hover any cell for its exact value.`;
  } else if(state.tmap==='prevented'){
    const conc=teamXtz(T,'conceded');
    grid=FIELD_XTZ.map((v,i)=>v-conc[i]);       // above average = threat suppressed
    col=cssv('--fg'); opts={mode:'div',hatchNeg:true,gamma:0.85,grid:true,ttl:'xT prevented per match'};
    cap1=`xT prevented per match`;
    note=`<b>Solid</b> = concedes <i>less</i> threat from that zone than the average team (suppressed);
      <b>hatched</b> = concedes more. Relative to the 48-team average. Hover any cell for its exact value.`;
  } else {
    grid=teamAvgHeat(T).map(v=>v/(T.mp||1)); col=cssv('--home');
    opts={grid:true,qnorm:true,gamma:1.0,dec:1,ttl:'Touches per match'};
    cap1=`Average heat map`;
    note=`Every on-ball action across all ${T.mp} matches, attacking left → right. Hover any cell for its exact value.`;
  }
  left.append(h(`<div class="eyebrow" style="margin-bottom:8px">${cap1}
    <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· ${T.mp} matches · attacking left → right</span></div>`));
  left.append(heatSvg(grid,col,opts));
  left.append(h(`<div class="footnote">${note}</div>`));
  cols.append(left);

  const right=h(`<div></div>`);
  right.append(h(`<div class="eyebrow" style="margin-bottom:10px">Expected threat (xT)</div>`));
  right.append(h(`<div class="footnote" style="margin:0 0 12px">xT values every pass by how much it raises the
    chance of scoring in the next few actions — a possession-value model fitted to this tournament.</div>`));
  const rows=[
    ['xT generated','xtpg',1,T.tac.xtpg,'per match','--cat-att'],
    ['xT conceded','xtapg',-1,T.tac.xtapg,'per match, lower is better','--cat-def'],
    ['xT prevented','xtprev',1,T.tac.xtprev,'vs the average team','--cat-pos'],
  ];
  rows.forEach(([lbl,key,dir,val,note,cv])=>{
    const pc=tacPct(key,val,dir);
    right.append(h(`<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:12.5px;font-weight:650">${lbl}</span>
        <span class="tnum" style="font-weight:750">${val>=0&&key==='xtprev'?'+':''}${val.toFixed(2)}</span></div>
      <div style="height:9px;border-radius:5px;background:var(--grid);margin:5px 0 3px;position:relative">
        <i style="position:absolute;left:0;top:0;height:100%;width:${pc}%;background:var(${cv});border-radius:5px"></i></div>
      <div class="muted" style="font-size:10.5px;display:flex;justify-content:space-between">
        <span>${note}</span><span>${pc}th percentile</span></div></div>`));
  });
  cols.append(right); wrap.append(cols);
  return wrap;
}

function teamTactical(T){
  const wrap=h(`<div class="card pad"></div>`);
  const cols=h(`<div style="display:grid;grid-template-columns:1.05fr 1fr;gap:22px" class="two-col"></div>`);
  const left=h(`<div></div>`);
  left.append(h(`<div class="eyebrow" style="margin-bottom:6px">Style radar <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· percentile vs 48 teams (dashed = median)</span></div>`));
  left.append(styleRadar(T)); cols.append(left);

  const right=h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  // tags
  const tagbox=h(`<div></div>`);
  tagbox.append(h(`<div class="eyebrow" style="margin-bottom:8px">Tactical identity</div>`));
  const chips=h(`<div style="display:flex;flex-wrap:wrap;gap:6px"></div>`);
  const tg=styleTags(T); if(!tg.length) chips.append(h(`<span class="muted" style="font-size:12px">balanced profile</span>`));
  tg.forEach(t=>chips.append(h(`<span class="chip" style="background:var(--home-soft);border-color:transparent;color:var(--ink)">${esc(t)}</span>`)));
  tagbox.append(chips); right.append(tagbox);
  // attack channels
  const {aL,aC,aR}=T.tac;
  const chan=h(`<div></div>`);
  chan.append(h(`<div class="eyebrow" style="margin-bottom:8px">Attacking channels</div>`));
  // three lanes need three distinct fills: solid ink / hatched / open
  chan.append(h(`<div style="display:flex;height:30px;border:1px solid var(--fg);overflow:hidden;font-family:var(--mono);font-size:10px;font-weight:700">
    <div style="width:${aL}%;background:var(--fg);color:var(--bg);display:grid;place-items:center">${Math.round(aL)}%</div>
    <div style="width:${aC}%;background-image:${HATCH_CSS};border-left:1px solid var(--fg);border-right:1px solid var(--fg);display:grid;place-items:center"><span style="background:var(--bg);padding:0 4px">${Math.round(aC)}%</span></div>
    <div style="width:${aR}%;display:grid;place-items:center">${Math.round(aR)}%</div></div>
    <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--fg-3);margin-top:6px"><span>Left · solid</span><span>Central · hatched</span><span>Right · open</span></div>`));
  right.append(chan);
  // key metrics grid
  const pv=T.tac.xtprev;
  const met=[['xT generated / game',T.tac.xtpg.toFixed(2)],['xT conceded / game',T.tac.xtapg.toFixed(2)],
    ['xT prevented / game',(pv>=0?'+':'')+pv.toFixed(2)],['Net xT / game',(T.tac.xtnet>=0?'+':'')+T.tac.xtnet.toFixed(2)],
    ['xG / game',T.tac.xgpg.toFixed(2)],['xG against / game',T.tac.xgapg.toFixed(2)],
    ['Shots / game',T.tac.shotspg.toFixed(1)],['Progressive / game',T.tac.progpg.toFixed(0)],
    ['Def. actions / game',T.tac.defactpg.toFixed(0)],['Aerials won',T.tac.aerpct.toFixed(0)+'%'],
    ['Set-piece xG share',T.tac.spshare.toFixed(0)+'%'],['Pass accuracy',T.tac.passpct.toFixed(0)+'%']];
  const mg=h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px"></div>`);
  met.forEach(([k,v])=>mg.append(h(`<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--grid);padding:4px 0">
    <span style="font-size:11.5px;color:var(--ink-2)">${k}</span><span class="tnum" style="font-weight:700;font-size:12.5px">${v}</span></div>`)));
  right.append(mg);
  cols.append(right); wrap.append(cols);
  return wrap;
}

/* ================================================= app state / router == */
const state={view:'overview', mi:0, tab:'summary', net:'home', lb:'scorers',
  sort:{key:'xg',dir:-1}, group:null, team:null, ko:'bracket', from:'overview',
  pPos:'all', pMin:270, pPer90:true, pSort:{key:'xg',dir:-1}, pSearch:'', pPlayer:null,
  hPlayer:'', pf:'all', tmap:'heat', pMode:'table', pcA:'', pcB:'', pxk:'npxg', pyk:'xa',
  tMode:'dossier', tcA:'', tcB:'', tcmap:'created', tRadar:'threat'};

/* single source of truth for the match-centre tabs — Match() renders these and the
   deep-link parser validates against them (declared here so it precedes both) */
const MATCH_TABS=[['summary','Summary'],['shots','Shots & xG'],['momentum','Momentum'],
  ['heat','Heatmap'],['passmap','Pass map'],['zones','Zones'],
  ['network','Pass network'],['lineups','Line-ups'],['players','Player stats']];
const MATCH_TAB_KEYS=MATCH_TABS.map(t=>t[0]);

document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{
  state.view=b.dataset.view;
  document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('on',x===b));
  render(); scrollTo(0,0);
});
$('#theme').onclick=()=>{
  const cur=document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', cur==='dark'?'light':'dark');
  render();
};

function openMatch(i){ state.from = (state.view==='match'?state.from:state.view);
  state.view='match'; state.mi=i; state.tab='summary';
  document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('on'));
  render(); scrollTo(0,0);
}
function goView(v){ state.view=v;
  document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('on',x.dataset.view===v));
  render(); scrollTo(0,0);
}

function render(){
  const V={overview:Overview, groups:Groups, knockouts:Knockouts, teams:Teams, players:Players, match:Match};
  APP.innerHTML=''; APP.append((V[state.view]||Overview)());
}

/* ========================================================= OVERVIEW ===== */
function Overview(){
  const root=h('<div></div>');
  const goals=M.reduce((s,m)=>s+m.score.ft[0]+m.score.ft[1],0);
  const teamsN=new Set(); M.forEach(m=>{teamsN.add(m.home.id);teamsN.add(m.away.id);});
  const shots=Math.round(M.reduce((s,m)=>s+m.teamStats.home.shots+m.teamStats.away.shots,0));

  /* ---- editorial hero: oversized display type + rule mark ---- */
  root.append(h(`<section style="padding:76px 0 0">
    <div class="eyebrow" style="margin-bottom:26px">${esc(DATA.tournament)} — Canada · Mexico · USA</div>
    <h2 style="font-size:clamp(46px,10.5vw,142px); line-height:.88; letter-spacing:-.045em">
      Every match,<br><em style="font-weight:400">measured.</em></h2>
    <div style="display:flex; align-items:stretch; gap:0; margin:44px 0 0">
      <span style="width:15px;height:15px;border:2px solid var(--fg);flex:none;align-self:center"></span>
      <span style="height:4px;background:var(--fg);flex:1;align-self:center"></span>
    </div>
    <p style="max-width:52ch; margin:30px 0 0; font-size:19px; line-height:1.62; color:var(--fg-2)">
      All <b style="color:var(--fg)">${M.length}</b> ${CHAMPION()?'fixtures of the completed tournament':'played fixtures of the tournament'} — twelve groups
      and the full knockout run — rebuilt from raw provider event data. Expected goals, expected threat,
      pressing, territory and every pass, for all forty-eight nations.</p>
  </section>`));

  /* champions bar — only once the final has actually been played */
  if(CHAMPION()){
    const f=FINAL_M(), t=THIRD_M();
    const runnerUp = winnerName(f)===f.home.name ? f.away.name : f.home.name;
    const third = t ? winnerName(t) : null;
    root.append(h(`<div class="champ">
      <div class="champ-main">
        <span class="champ-k">Champions</span>
        <span class="champ-n">${esc(CHAMPION())}</span>
      </div>
      <div class="champ-rest">
        <span><b>${esc(runnerUp)}</b> runners-up</span>
        ${third?`<span><b>${esc(third)}</b> third</span>`:''}
        <span>final ${f.score.ft[0]}–${f.score.ft[1]}${f.score.aet?' AET':''}${
          f.score.pens?`, pens ${f.score.pens[0]}–${f.score.pens[1]}`:''}</span>
      </div></div>`));
  }

  const tiles=h(`<div class="tiles" style="margin-top:58px"></div>`);
  [['Matches',M.length,CHAMPION()?'group stage → final':'group stage → semi-finals'],
   ['Goals',goals,(goals/M.length).toFixed(2)+' per game'],
   ['Nations',teamsN.size,'across the tournament'],
   ['Shots',shots.toLocaleString(),'each with model xG']]
   .forEach(([k,v,d])=>tiles.append(h(`<div class="tile"><div class="k">${k}</div>
     <div class="v">${v}</div><div class="d">${d}</div></div>`)));
  root.append(tiles);

  /* the run-in: QF -> SF -> Final */
  root.append(h(`<div class="section-h"><h2>The run-in</h2><span class="note">quarter-finals to the final · click a tie to open it
    · <a style="cursor:pointer;color:var(--accent)" onclick="goView('knockouts')">full bracket →</a></span></div>`));
  root.append(miniBracket());

  /* leaderboards */
  root.append(h(`<div class="section-h"><h2>Golden Boot &amp; leaders</h2><span class="note">aggregated across all ${M.length} matches</span></div>`));
  root.append(leaderboards());

  /* team ledger */
  root.append(h(`<div class="section-h"><h2>Team ledger</h2><span class="note">every nation · record, goals, xG for &amp; against
    · <a style="cursor:pointer;color:var(--accent)" onclick="goView('teams')">team explorer →</a></span></div>`));
  root.append(teamTable());
  return root;
}

/* tie card (a played knockout match) */
function tieCard(m,label){
  const [hs,as]=m.score.ft; const w=winnerName(m); const i=idxOf(m);
  // read the shootout off the feed rather than inferring it from "drew, yet someone
  // won" — that inference invented four shootouts for ties actually won in extra time
  const pens = m.score.pens, aet = m.score.aet;
  const line=(name,sc,win)=>`<div style="display:flex;justify-content:space-between;gap:8px;${win?'':'color:var(--muted)'}">
     <span style="font-weight:${win?750:500};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span>
     <span class="tnum" style="font-weight:700">${sc}</span></div>`;
  const c=h(`<div class="card" style="padding:11px 13px;cursor:pointer;min-width:0"></div>`);
  c.onclick=()=>openMatch(i);
  c.innerHTML=`<div class="muted" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${esc(label||STAGE_LABEL[m.stage]||m.stage)}</div>
    ${line(m.home.name,hs,w===m.home.name)}${line(m.away.name,as,w===m.away.name)}
    ${pens?`<div class="muted" style="font-size:10px;margin-top:3px">${esc(w)} on penalties ${pens[0]}–${pens[1]}</div>`
      :aet?`<div class="muted" style="font-size:10px;margin-top:3px">after extra time · ${m.score.reg[0]}–${m.score.reg[1]} at 90′</div>`:''}`;
  return c;
}

/* mini bracket: QF -> SF -> Final (final computed from SF winners) */
function miniBracket(){
  const wrap=h(`<div class="card pad" style="overflow-x:auto"></div>`);
  const qf=M.filter(m=>m.stage==='Quarter-finals').sort((a,b)=>a.date<b.date?-1:1);
  const sf=M.filter(m=>m.stage==='Semi-finals').sort((a,b)=>a.date<b.date?-1:1);
  const finalists=sf.map(winnerName).filter(Boolean);
  const col=(title,cards)=>`<div style="min-width:190px;flex:1"><div class="eyebrow" style="margin-bottom:10px">${title}</div>
    <div style="display:grid;gap:10px" data-col></div></div>`;
  const fm=FINAL_M(), tm=THIRD_M();
  wrap.innerHTML=`<div style="display:flex;gap:18px;min-width:640px">
    ${col('Quarter-finals')}${col('Semi-finals')}${col(fm?'Final':'Final · 19 Jul')}</div>`;
  const cols=wrap.querySelectorAll('[data-col]');
  qf.forEach(m=>cols[0].append(tieCard(m)));
  sf.forEach(m=>cols[1].append(tieCard(m)));
  if(fm){
    cols[2].append(tieCard(fm));
    if(tm) cols[2].append(tieCard(tm,'Third place'));
  } else {
    // kept for the window between the semis and the final being played
    cols[2].append(h(`<div class="card pad" style="padding:12px 13px;border:1px dashed var(--line);background:transparent">
      <div class="muted" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Final · MetLife</div>
      <div style="display:flex;justify-content:space-between;gap:8px"><span style="font-weight:750">${esc(finalists[0]||'TBD')}</span><span class="muted">vs</span><span style="font-weight:750">${esc(finalists[1]||'TBD')}</span></div>
      <div class="muted" style="font-size:10px;margin-top:4px">to be played</div></div>`));
  }
  return wrap;
}

function matchCard(m,i){
  const [hs,as]=m.score.ft; const hw=hs>as, aw=as>hs;
  const xh=m.teamStats.home.xg, xa=m.teamStats.away.xg, xt=Math.max(xh+xa,.01);
  const c=h(`<div class="card match-card"></div>`);
  c.onclick=()=>openMatch(i);
  // monochrome side encoding: home = solid ink, away = hatched
  c.innerHTML=`
   <div class="mc-top"><span class="pill">${esc(m.stage)}</span>
     <span class="muted" style="font-family:var(--mono);font-size:9.5px;letter-spacing:.12em">${esc(fmtDate(m.date)).toUpperCase()}</span></div>
   <div class="mc-row ${hw?'win':aw?'lose':''}"><span class="dot" style="background:currentColor"></span>
     <span class="nm">${esc(m.home.name)}</span><span class="sc">${hs}</span></div>
   <div class="mc-row ${aw?'win':hw?'lose':''}"><span class="dot" style="background:none;border:1px solid currentColor"></span>
     <span class="nm">${esc(m.away.name)}</span><span class="sc">${as}</span></div>
   <div class="mc-xg"><span>xG</span>
     <span class="tnum" style="font-weight:700">${xh.toFixed(2)}</span>
     <span class="xgbar"><i style="width:${100*xh/xt}%;background:currentColor"></i><i style="width:${100*xa/xt}%;background-image:repeating-linear-gradient(45deg,currentColor 0 2px,transparent 2px 5px)"></i></span>
     <span class="tnum" style="font-weight:700">${xa.toFixed(2)}</span></div>`;
  return c;
}

/* ---- leaderboards ---- */
function leaderboards(){
  const box=h(`<div class="card pad"></div>`);
  const tabs=h(`<div class="subtabs" style="margin-bottom:14px"></div>`);
  const defs={scorers:['Scorers','goals'],xg:['xG','xg'],
    playmakers:['Playmakers','prog'],passers:['Passers','passes'],
    ballwin:['Ball-winning','_def']};
  Object.entries(defs).forEach(([k,[lbl]])=>{
    const b=h(`<button class="${k===state.lb?'on':''}">${lbl}</button>`);
    b.onclick=()=>{state.lb=k; box.replaceWith(leaderboards());}; tabs.append(b);
  });
  box.append(tabs);
  const key=defs[state.lb][1];
  let rows=AGG.players.map(p=>({...p,_def:p.tackles+p.intercept}));
  rows=rows.filter(p=>p[key]>0).sort((a,b)=>b[key]-a[key]).slice(0,12);
  const max=Math.max(...rows.map(r=>r[key]),1);
  const list=h(`<div style="display:grid;gap:2px"></div>`);
  rows.forEach((p,i)=>{
    const val = key==='xg'?p.xg.toFixed(2):p[key];
    list.append(h(`<div style="display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:12px;padding:7px 4px;border-bottom:1px solid var(--grid)">
      <span class="lb-rank tnum">${i+1}</span>
      <div style="min-width:0"><div style="font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
        <div class="muted" style="font-size:11px">${esc(p.team)} · ${p.mp} ${p.mp>1?'apps':'app'}</div></div>
      <div style="display:flex;align-items:center;gap:10px;width:150px">
        <span class="lb-bar" style="width:${Math.max(6,100*p[key]/max)}%"></span>
        <span class="tnum" style="font-weight:750;width:38px;text-align:right">${val}</span></div>
    </div>`));
  });
  box.append(list);
  return box;
}

/* ---- team table ---- */
function teamTable(){
  const box=h(`<div class="card pad" style="overflow-x:auto"></div>`);
  const rows=[...AGG.teams].sort((a,b)=>b.w-a.w||b.gd-a.gd||b.gf-a.gf);
  const t=h(`<table><thead><tr>
    <th>Nation</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th>
    <th>xG</th><th>xGA</th><th>Poss</th></tr></thead><tbody></tbody></table>`);
  const tb=$('tbody',t);
  rows.forEach(r=>{const tr=h(`<tr style="cursor:pointer">
    <td class="name">${teamBadge(r.code)}${esc(r.name)}</td>
    <td class="tnum">${r.mp}</td><td class="tnum">${r.w}</td><td class="tnum">${r.d}</td><td class="tnum">${r.l}</td>
    <td class="tnum">${r.gf}</td><td class="tnum">${r.ga}</td><td class="tnum">${r.gd>0?'+':''}${r.gd}</td>
    <td class="tnum">${r.xg.toFixed(1)}</td><td class="tnum">${r.xga.toFixed(1)}</td>
    <td class="tnum">${pct(r.poss)}</td></tr>`);
    tr.onclick=()=>{state.team=r.id; goView('teams');}; tb.append(tr);});
  box.append(t);
  box.append(h(`<div class="footnote">xG is a shot-quality model estimate (logistic on shot location, header &amp; set-piece adjusted); the source feed carries no native xG. Possession is completed-pass share.</div>`));
  return box;
}

/* ============================================================ MATCH ===== */
function Match(){
  // clamp here as well as at the deep-link parser: this is where the invariant is
  // actually needed, so no future caller can blank the page with a stray index
  if(!Number.isInteger(state.mi) || state.mi<0 || state.mi>=M.length)
    state.mi=Math.min(Math.max(Math.trunc(+state.mi)||0,0), M.length-1);
  const m=M[state.mi];
  const root=h('<div></div>');
  const backLabel={overview:'Overview',groups:'Groups',knockouts:'Knockouts',teams:'Teams'}[state.from]||'Overview';
  const back=h(`<div style="margin:22px 0 14px"><span class="back">← ${backLabel}</span></div>`);
  $('.back',back).onclick=()=>goView(state.from||'overview');
  root.append(back);
  root.append(matchHeader(m));

  const tabs=h(`<div class="subtabs" style="margin:16px 0 18px"></div>`);
  MATCH_TABS
   .forEach(([k,l])=>{const b=h(`<button class="${state.tab===k?'on':''}">${l}</button>`);
     b.onclick=()=>{state.tab=k; render();}; tabs.append(b);});
  root.append(tabs);

  const panel=h('<div></div>');
  if(state.tab==='summary') panel.append(matchSummary(m));
  else if(state.tab==='shots') panel.append(shotsPanel(m));
  else if(state.tab==='momentum') panel.append(momentumPanel(m));
  else if(state.tab==='heat') panel.append(heatPanel(m));
  else if(state.tab==='passmap') panel.append(passPanel(m));
  else if(state.tab==='zones') panel.append(zonesPanel(m));
  else if(state.tab==='network') panel.append(networkPanel(m));
  else if(state.tab==='lineups') panel.append(lineupPanel(m));
  else panel.append(playersPanel(m));
  root.append(panel);
  return root;
}

function matchHeader(m){
  const [hs,as]=m.score.ft; const [hh,ah]=m.score.ht;
  const c=h(`<div class="card"></div>`);
  c.innerHTML=`<div style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;
      justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <span class="chip">${esc(m.stage)}</span>
      <span class="muted" style="font-size:12px">${esc(fmtDate(m.date))} · ${esc(m.venue)} · ${m.lengthMin}′ played</span></div>
    <div class="mh">
      <div class="team"><div style="display:flex;align-items:center;gap:11px">${teamBadge(m.home.code)}
        <div><div class="nm">${esc(m.home.name)}</div><div class="fm">${esc(m.home.formation)}</div></div></div></div>
      <div class="score tnum">${hs}<span style="color:var(--muted);font-weight:600"> – </span>${as}
        <div class="ht">HT ${hh}–${ah}${m.score.aet?` · AET, ${m.score.reg[0]}–${m.score.reg[1]} at 90′`:''}${
          m.score.pens?` · pens ${m.score.pens[0]}–${m.score.pens[1]}`:''}</div></div>
      <div class="team r"><div style="display:flex;align-items:center;gap:11px;flex-direction:row-reverse">${teamBadge(m.away.code)}
        <div style="text-align:right"><div class="nm">${esc(m.away.name)}</div><div class="fm">${esc(m.away.formation)}</div></div></div></div>
    </div>`;
  return c;
}

/* ---- summary: comparison bars + shot map preview + timeline ---- */
function matchSummary(m){
  const wrap=h(`<div class="grid two-col"></div>`);
  const H=m.teamStats.home, A=m.teamStats.away;
  const stats=[['Possession',H.possession,A.possession,'%',0],
    ['Expected goals (xG)',H.xg,A.xg,'',2],
    ['Shots',H.shots,A.shots,'',0],['On target',H.sot,A.sot,'',0],
    ['Passes',H.pass,A.pass,'',0],['Pass accuracy',H.pass_pct,A.pass_pct,'%',0],
    ['Progressive passes',H.prog_pass,A.prog_pass,'',0],
    ['Final-third entries',H.final_third,A.final_third,'',0],
    ['Duels won (aerial)',H.aerial_ok,A.aerial_ok,'',0],
    ['Tackles',H.tackle,A.tackle,'',0],['Interceptions',H.interception,A.interception,'',0],
    ['Corners',H.corner,A.corner,'',0]];
  const left=h(`<div class="card pad"></div>`);
  left.append(h(`<div class="eyebrow" style="margin-bottom:14px">Head to head</div>`));
  const cmp=h(`<div class="cmp"></div>`);
  stats.forEach(([lbl,hv,av,suf,dec])=>{
    const tot=Math.max(hv+av,.001); const hp=100*hv/tot, ap=100*av/tot;
    const hd=hv>=av;
    cmp.append(h(`<div class="cmp-row"><div class="lbl">${lbl}</div>
      <div class="cmp-val" style="${hd?'color:var(--home)':''}">${(+hv).toFixed(dec)}${suf}</div>
      <div class="cmp-track"><i class="h" style="width:${hp}%;opacity:${hd?1:.55}"></i><i class="a" style="width:${ap}%;opacity:${!hd?1:.55}"></i></div>
      <div class="cmp-val r" style="${!hd?'color:var(--away)':''}">${(+av).toFixed(dec)}${suf}</div></div>`));
  });
  left.append(cmp);

  const right=h(`<div style="display:grid;gap:16px;align-content:start"></div>`);
  const sc=h(`<div class="card pad"></div>`);
  sc.append(h(`<div class="eyebrow" style="margin-bottom:6px">Match timeline</div>`));
  sc.append(timelineChart(m));
  right.append(sc);
  const sm=h(`<div class="card pad"></div>`);
  sm.append(h(`<div class="eyebrow" style="margin-bottom:10px">Shot map</div>`));
  sm.append(shotMap(m));
  sm.append(shotLegend());
  right.append(sm);

  wrap.append(left,right);
  return wrap;
}

/* ---- shots panel: full shot map + xG race + shot table ---- */
function shotsPanel(m){
  const wrap=h(`<div class="grid" style="gap:16px"></div>`);
  const top=h(`<div class="grid two-col"></div>`);
  const a=h(`<div class="card pad"></div>`);
  a.append(h(`<div class="eyebrow" style="margin-bottom:10px">Shot map — location &amp; quality</div>`));
  a.append(shotMap(m,true)); a.append(shotLegend());
  const b=h(`<div class="card pad"></div>`);
  b.append(h(`<div class="eyebrow" style="margin-bottom:10px">Cumulative xG</div>`));
  b.append(xgRace(m));
  top.append(a,b); wrap.append(top);
  wrap.append(shotTable(m));
  return wrap;
}

/* ---- momentum panel ---- */
function momentumPanel(m){
  const wrap=h(`<div class="card pad"></div>`);
  wrap.append(h(`<div class="eyebrow" style="margin-bottom:4px">Attacking momentum</div>`));
  wrap.append(h(`<div class="footnote" style="margin:0 0 12px">Net xG created in each 5-minute window — bars toward a side show that team on top. Goals marked ●.</div>`));
  wrap.append(momentumChart(m));
  return wrap;
}

/* ===================== SPATIAL: heatmap / pass map / zones ============== */
let _fid=0;                                 // unique svg filter ids
const PF={ok:1,prog:2,f3:4,box:8,z14:16,hs:32};
function passesOf(m,side){                  // decode flat pass array
  const a=(m.passes&&m.passes[side])||[], out=[];
  for(let i=0;i<a.length;i+=6) out.push({pi:a[i],x:a[i+1],y:a[i+2],ex:a[i+3],ey:a[i+4],f:a[i+5]});
  return out;
}
function sparseToGrid(arr){                 // decode sparse [cell,count,...]
  const g=new Array(HX*HY).fill(0);
  for(let i=0;i<arr.length;i+=2) g[arr[i]]=arr[i+1];
  return g;
}

/* blurred density map drawn under the pitch lines.
   mode 'seq'  -> one hue, opacity ∝ value
   mode 'div'  -> two hues about zero (col = positive, neg = negative) */
/* zone descriptor for grid tooltips — attacking left → right, y=0 is the attacker's left */
function zoneName(gx,gy){
  const third = gx < HX/3 ? 'Defensive third' : gx < 2*HX/3 ? 'Middle third' : 'Attacking third';
  // low provider y is the attacking team's RIGHT (see PY) — this label was inverted
  const lane  = gy < 3 ? 'right' : gy > 4 ? 'left' : 'centre';
  return `${third} · ${lane}`;
}
function heatSvg(grid,col,opts={}){
  const mode=opts.mode||'seq', hatchNeg=!!opts.hatchNeg, ruled=!!opts.grid;
  // gamma <1 lifts mid values (xT maps are heavily skewed); >1 adds contrast (touch counts)
  const gam=opts.gamma!=null?opts.gamma:1.25;
  // a ruled grid draws every cell (the rules are the point); a blurred map drops the tail
  const cut=ruled?0:(opts.cut!=null?opts.cut:0.06);
  // Touch grids vary hugely in density — a team's whole campaign fills every cell,
  // one player in one match lights up a dozen. Scaling those to the single busiest
  // cell leaves the sparse ones almost blank, so `qnorm` scales to the 95th-percentile
  // busy cell instead and saturates above it: one spike no longer flattens the rest.
  let max, gam2=gam;
  const mags = mode==='div' ? grid.map(Math.abs) : grid;
  if(opts.qnorm){
    const nz=mags.filter(v=>v>0).sort((a,b)=>a-b);
    max=Math.max(nz.length?nz[Math.floor(0.95*(nz.length-1))]:0, 1e-9);
    // ...and pick the ramp from the shape of the data rather than by hand: solve for
    // the gamma that puts the MEDIAN occupied cell at ~0.35 opacity. A near-uniform
    // campaign map then gets a steep ramp (contrast, so hot zones separate) while a
    // spiky single-player map gets a shallow one (so its zone stays visible). One
    // fixed gamma cannot serve both — 2.0 erased a 91-touch player, 1.0 blackened a team.
    const med=nz.length?nz[Math.floor(0.5*(nz.length-1))]:0;
    const mr=Math.min(0.95, Math.max(0.05, med/max));
    gam2=Math.min(2.5, Math.max(0.6, Math.log(0.35)/Math.log(mr)));
  } else max=Math.max(...mags,1e-9);
  const id='hb'+(++_fid);
  let cells='';
  const cw=PW/HX, ch=PH/HY;
  const hid='hp'+_fid;
  const dec=opts.dec!=null?opts.dec:3, ttl=opts.ttl||'Value';
  grid.forEach((v,i)=>{
    // a zone's net xT can be negative (backward passes shed threat), so clamp for the
    // ramp — Math.pow of a negative is NaN, and a ruled grid must never drop a cell or
    // the lattice reads as a hole. The tooltip still reports the true signed value.
    const r=Math.min(1, Math.max(0,(mode==='div'?Math.abs(v):v)/max));   // qnorm can exceed 1
    if(!ruled && r<cut) return;                // blurred maps drop the long tail so hot zones read
    const gx=i%HX, gy=Math.floor(i/HX);
    const o=r<=0?0:0.92*Math.pow(r,gam2);
    // negative half of a diverging scale is hatched, not recoloured — the
    // palette is monochrome, so sign is carried by texture
    const isNeg = (mode==='div' && v<0);
    const c = (isNeg && hatchNeg) ? `url(#${hid})` : col;
    // grid rows are indexed by raw provider y, so the row order must be inverted here to
    // match PY — otherwise the cells sit mirrored against the pitch markings
    const rect=`x="${(gx*cw).toFixed(2)}" y="${((HY-1-gy)*ch).toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}"`;
    if(ruled){
      // shading is clamped at zero, so the tooltip is the only place the true sign shows
      const tt=`${esc(ttl)}||${zoneName(gx,gy)}||${mode==='div'&&v>=0?'+':''}${v.toFixed(dec)}${mode==='div'?' vs field avg':''}`;
      cells+=`<rect class="zc" ${rect} fill="${c}" fill-opacity="${o.toFixed(3)}" data-tt="${tt}"/>`;
    } else {
      cells+=`<rect ${rect} fill="${c}" fill-opacity="${o.toFixed(3)}"/>`;
    }
  });
  // The lattice is drawn over the tiles in two passes: pitch-coloured "mortar" so
  // neighbouring cells at similar values stay distinct, then a faint rule so the
  // 12x8 grid xT is actually defined on still reads across the cold, empty zones.
  let rules='';
  if(ruled){
    const line=(x1,y1,x2,y2,col,w)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}"/>`;
    [[cssv('--pitch'),'.5'],[cssv('--grid'),'.3']].forEach(([col,w])=>{
      for(let i=1;i<HX;i++) rules+=line((i*cw).toFixed(2),0,(i*cw).toFixed(2),PH,col,w);
      for(let j=1;j<HY;j++) rules+=line(0,(j*ch).toFixed(2),PW,(j*ch).toFixed(2),col,w);
    });
  }
  const hatchDef = hatchNeg ? `<pattern id="${hid}" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="3" height="3" fill="${col}" fill-opacity=".18"/><rect width="1.4" height="3" fill="${col}"/></pattern>` : '';
  const blurDef = ruled ? '' : `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="2.2"/></filter>`;
  const inner=`<defs>${hatchDef}${blurDef}</defs>
    <rect x="0" y="0" width="${PW}" height="${PH}" fill="${cssv('--pitch')}"/>
    <g ${ruled?'':`filter="url(#${id})"`}>${cells}</g>
    ${rules}
    ${pitchMarks(false)}
    <text x="2" y="${PH-2}" font-size="2.6" fill="${cssv('--muted')}">attacking →</text>`;
  const el=svgEl(`0 0 ${PW} ${PH}`, inner);
  if(ruled) attachZoneTT(el);
  return el;
}
/* hover readout for ruled grids: highlight the cell, print the exact value */
function attachZoneTT(elWrap){
  const svg=$('svg',elWrap);
  let cur=null;
  const clear=()=>{ if(cur){cur.removeAttribute('stroke'); cur.removeAttribute('stroke-width'); cur=null;} TT.style.opacity=0; };
  svg.addEventListener('mousemove',e=>{
    const t=e.target;
    if(t.classList&&t.classList.contains('zc')&&t.dataset.tt){
      if(cur!==t){ clear(); cur=t; t.setAttribute('stroke',cssv('--fg')); t.setAttribute('stroke-width','.6'); }
      const [a,b,c]=t.dataset.tt.split('||');
      TT.innerHTML=`<div class="tt-h">${a}</div><div class="tt-r">${b||''}</div><div class="tt-r">${c||''}</div>`;
      TT.style.opacity=1; TT.style.left=Math.min(e.clientX+14,innerWidth-240)+'px'; TT.style.top=(e.clientY+14)+'px';
    } else clear();
  });
  svg.addEventListener('mouseleave',clear);
}

function heatPanel(m){
  const side=state.net, col=COL(side);
  const wrap=h(`<div class="card pad"></div>`);
  const head=h(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"></div>`);
  head.append(h(`<div class="eyebrow">Touch heatmap</div>`));
  const seg=h(`<div class="seg"></div>`);
  ['home','away'].forEach(s=>{const b=h(`<button class="${s} ${state.net===s?'on':''}">${esc(m[s].name)}</button>`);
    b.onclick=()=>{state.net=s; state.hPlayer=''; render();}; seg.append(b);});
  head.append(seg);
  // player selector (only players with a stored grid)
  const ph=(m.pheat&&m.pheat[side])||{};
  const sel=h(`<select style="font:inherit;font-weight:600;padding:7px 10px;border-radius:9px;border:1px solid var(--border);background:var(--surface-1);color:var(--ink);cursor:pointer"></select>`);
  sel.append(h(`<option value="">Whole team</option>`));
  Object.keys(ph).map(Number).sort((a,b)=>a-b).forEach(i=>{
    const p=m.players[side][i]; if(!p)return;
    sel.append(h(`<option value="${i}" ${String(i)===String(state.hPlayer)?'selected':''}>${esc(p.name)}</option>`));
  });
  sel.onchange=()=>{state.hPlayer=sel.value; render();};
  head.append(sel); wrap.append(head);

  const grid = state.hPlayer!=='' && ph[state.hPlayer] ? sparseToGrid(ph[state.hPlayer]) : m.heat[side];
  const who = state.hPlayer!=='' && m.players[side][+state.hPlayer] ? m.players[side][+state.hPlayer].name : m[side].name;
  wrap.append(cap(heatSvg(grid,col,{grid:true,qnorm:true,gamma:1.0,dec:0,ttl:`${who} · touches`})));
  const total=grid.reduce((a,b)=>a+b,0);
  wrap.append(h(`<div class="footnote">${esc(who)} · <b>${total}</b> on-ball actions (passes, touches, duels, shots, defensive actions),
    binned to a ${HX}×${HY} grid. Hover any cell for its exact count. ${esc(m[side].name)} attack left → right.</div>`));
  return wrap;
}

/* ---- pass map ---- */
const PASS_FILTERS=[['all','All'],['prog','Progressive'],['f3','Into final third'],
  ['box','Into box'],['z14','Into zone 14'],['hs','Into half-spaces']];
/* Arrowhead at the end of a pass, built in SVG space (the pitch is squashed by YK,
   so the on-screen angle is not the pitch angle — computing this from raw pitch
   coordinates would point the heads slightly wrong). Clamped so a short pass never
   gets an arrowhead longer than the pass itself. */
function arrowMark(x1,y1,x2,y2,size,col,op){
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy);
  if(len<0.5) return '';
  const s=Math.min(size, len*0.42);
  const ux=dx/len, uy=dy/len, px=-uy, py=ux;
  const bx=x2-ux*s, by=y2-uy*s, w=s*0.5;
  return `<polygon points="${x2.toFixed(2)},${y2.toFixed(2)} ${(bx+px*w).toFixed(2)},${(by+py*w).toFixed(2)} ${(bx-px*w).toFixed(2)},${(by-py*w).toFixed(2)}" fill="${col}" fill-opacity="${op}"/>`;
}
function passPanel(m){
  const side=state.net, col=COL(side);
  const wrap=h(`<div class="card pad"></div>`);
  const head=h(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"></div>`);
  head.append(h(`<div class="eyebrow">Pass map</div>`));
  const seg=h(`<div class="seg"></div>`);
  ['home','away'].forEach(s=>{const b=h(`<button class="${s} ${state.net===s?'on':''}">${esc(m[s].name)}</button>`);
    b.onclick=()=>{state.net=s; render();}; seg.append(b);});
  head.append(seg); wrap.append(head);
  const tabs=h(`<div class="subtabs" style="margin-bottom:12px"></div>`);
  PASS_FILTERS.forEach(([k,l])=>{const b=h(`<button class="${state.pf===k?'on':''}">${l}</button>`);
    b.onclick=()=>{state.pf=k; render();}; tabs.append(b);});
  wrap.append(tabs);

  const all=passesOf(m,side);
  const bit={prog:PF.prog,f3:PF.f3,box:PF.box,z14:PF.z14,hs:PF.hs}[state.pf];
  const sel = state.pf==='all' ? all : all.filter(p=>p.f & bit);
  const dense = state.pf==='all';
  let lines='',dots='';
  sel.forEach(p=>{
    const ok=p.f & PF.ok;
    const c = dense ? (ok?col:cssv('--muted')) : col;
    const op = dense ? (ok?.34:.22) : .8;
    const x1=PX(p.x), y1=PY(p.y), x2=PX(p.ex), y2=PY(p.ey);
    // stop the line short of the arrowhead so the two don't overlap into a blob
    const dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy);
    const head = dense ? Math.min(0.95, L*0.42) : Math.min(2.1, L*0.42);
    const lx = head ? x2-(dx/L)*head*0.85 : x2, ly = head ? y2-(dy/L)*head*0.85 : y2;
    lines+=`<line x1="${x1}" y1="${y1}" x2="${lx}" y2="${ly}"
      stroke="${c}" stroke-opacity="${op}" stroke-width="${dense?.22:.55}" stroke-linecap="round"/>`;
    dots+=arrowMark(x1,y1,x2,y2,dense?0.95:2.1,c,dense?op:.95);
  });
  wrap.append(cap(svgEl(`0 0 ${PW} ${PH}`, pitchMarks()+lines+dots)));
  const comp=sel.filter(p=>p.f&PF.ok).length;
  wrap.append(h(`<div class="legend"><span class="it"><b class="tnum">${sel.length}</b> passes shown</span>
    <span class="it"><b class="tnum">${comp}</b> completed (${sel.length?Math.round(100*comp/sel.length):0}%)</span>
    ${state.pf==='all'?`<span class="it"><span class="dot" style="background:var(--muted)"></span>incomplete</span>`:''}
    <span class="it muted">arrowhead = where the pass ended · attacking left → right</span></div>`));
  return wrap;
}

/* ---- zones: zone 14, half-spaces, box ---- */
function zonesPanel(m){
  const wrap=h(`<div></div>`);
  const top=h(`<div class="card pad"></div>`);
  const head=h(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"></div>`);
  head.append(h(`<div class="eyebrow">Zone 14 &amp; half-spaces</div>`));
  const seg=h(`<div class="seg"></div>`);
  ['home','away'].forEach(s=>{const b=h(`<button class="${s} ${state.net===s?'on':''}">${esc(m[s].name)}</button>`);
    b.onclick=()=>{state.net=s; render();}; seg.append(b);});
  head.append(seg); top.append(head);

  const side=state.net, col=COL(side), z=(m.zones&&m.zones[side])||{};
  // zone overlay pitch: highlight zone 14, both half-spaces and the box
  // PY inverts y, so PY(y1)-PY(y0) is negative — take the span, not the difference
  const Z=(x0,x1,y0,y1,fill,op)=>`<rect x="${x0}" y="${Math.min(PY(y0),PY(y1))}" width="${x1-x0}" height="${Math.abs(PY(y1)-PY(y0))}"
     fill="${fill}" fill-opacity="${op}" stroke="${fill}" stroke-width=".3" stroke-opacity=".8"/>`;
  const lbl=(x,y,t,v)=>`<rect x="${x-13}" y="${PY(y)-4.6}" width="26" height="9.6" fill="${cssv('--bg')}"/>
     <text x="${x}" y="${PY(y)}" font-size="3.1" font-weight="800" text-anchor="middle" fill="${cssv('--fg')}">${v}</text>
     <text x="${x}" y="${PY(y)+3.4}" font-size="2.3" text-anchor="middle" fill="${cssv('--fg-2')}">${t}</text>`;
  const zhid='zn'+(++_hid);
  const overlay = `<defs>${hatchPattern(zhid,cssv('--fg'),0)}</defs>`
    + Z(66.7,83,21,36.8,`url(#${zhid})`,.9) + Z(66.7,83,63.2,79,`url(#${zhid})`,.9)
    + Z(66.7,83,36.8,63.2,cssv('--fg'),.26)
    + Z(83,100,21,79,cssv('--fg'),.08)
    + lbl(74.8,50,'Zone 14',Math.round(z.z14_touch||0))
    // each label sits at the centre of the band it reports: the low-y band (21-36.8)
    // is the RIGHT half-space, the high-y band (63.2-79) is the LEFT
    + lbl(74.8,28.5,'Half-space',Math.round(z.hsR_touch||0))
    + lbl(74.8,71.5,'Half-space',Math.round(z.hsL_touch||0))
    + lbl(91.5,50,'Box',Math.round(z.box_touch||0));
  top.append(cap(svgEl(`0 0 ${PW} ${PH}`, pitchMarks()+overlay)));
  top.append(h(`<div class="footnote">Numbers are on-ball actions inside each zone for ${esc(m[side].name)} (attacking left → right).
    Zone 14 is the central pocket between the box and the edge of the final third — the highest-value creative area.</div>`));
  wrap.append(top);

  // comparison + top occupants
  const grid=h(`<div class="grid two-col" style="margin-top:16px"></div>`);
  const cmpCard=h(`<div class="card pad"></div>`);
  cmpCard.append(h(`<div class="eyebrow" style="margin-bottom:14px">Zone occupation — head to head</div>`));
  const H=(m.zones||{}).home||{}, A=(m.zones||{}).away||{};
  const rows=[['Zone 14 touches','z14_touch'],['Passes into zone 14','z14_in'],
    ['Left half-space touches','hsL_touch'],['Right half-space touches','hsR_touch'],
    ['Passes into half-spaces','hsL_in','hsR_in'],
    ['Box touches','box_touch'],['Passes into box','box_in'],['Final-third touches','f3_touch']];
  const cmp=h(`<div class="cmp"></div>`);
  rows.forEach(r=>{
    const get=(o)=> r.length>2 ? (o[r[1]]||0)+(o[r[2]]||0) : (o[r[1]]||0);
    const hv=get(H), av=get(A), tot=Math.max(hv+av,.001), hd=hv>=av;
    cmp.append(h(`<div class="cmp-row"><div class="lbl">${r[0]}</div>
      <div class="cmp-val" style="${hd?'color:var(--home)':''}">${Math.round(hv)}</div>
      <div class="cmp-track"><i class="h" style="width:${100*hv/tot}%;opacity:${hd?1:.55}"></i><i class="a" style="width:${100*av/tot}%;opacity:${!hd?1:.55}"></i></div>
      <div class="cmp-val r" style="${!hd?'color:var(--away)':''}">${Math.round(av)}</div></div>`));
  });
  cmpCard.append(cmp); grid.append(cmpCard);

  const topCard=h(`<div class="card pad"></div>`);
  topCard.append(h(`<div class="eyebrow" style="margin-bottom:12px">Who occupied zone 14</div>`));
  ['home','away'].forEach(s=>{
    const zz=(m.zones&&m.zones[s])||{}, list=zz.top14||[];
    topCard.append(h(`<div style="display:flex;align-items:center;gap:8px;margin:10px 0 6px">
      <span class="dot" style="background:var(--${s})"></span><b style="font-size:12.5px">${esc(m[s].name)}</b></div>`));
    if(!list.length) topCard.append(h(`<div class="muted" style="font-size:12px">no zone-14 actions</div>`));
    const mx=Math.max(...list.map(v=>v[1]),1);
    list.forEach(([pi,n])=>{
      const p=m.players[s][pi]; if(!p)return;
      topCard.append(h(`<div style="display:grid;grid-template-columns:1fr 90px 24px;gap:10px;align-items:center;padding:3px 0">
        <span style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
        <span style="height:7px;border-radius:4px;background:var(--${s});width:${Math.max(10,100*n/mx)}%"></span>
        <span class="tnum" style="font-size:12px;font-weight:700;text-align:right">${n}</span></div>`));
    });
  });
  grid.append(topCard); wrap.append(grid);
  return wrap;
}

/* ---- network panel ---- */
function networkPanel(m){
  const wrap=h(`<div class="card pad"></div>`);
  const head=h(`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px"></div>`);
  head.append(h(`<div class="eyebrow">Passing network &amp; average positions</div>`));
  const seg=h(`<div class="seg"></div>`);
  const bh=h(`<button class="home ${state.net==='home'?'on':''}">${esc(m.home.name)}</button>`);
  const ba=h(`<button class="away ${state.net==='away'?'on':''}">${esc(m.away.name)}</button>`);
  bh.onclick=()=>{state.net='home'; render();}; ba.onclick=()=>{state.net='away'; render();};
  seg.append(bh,ba); head.append(seg); wrap.append(head);
  wrap.append(passNetwork(m,state.net));
  wrap.append(h(`<div class="footnote">Node position = player's average location on completed passes; node size ∝ passes played; link width ∝ passes combined between a pair (min 3). Attacking left → right.</div>`));
  return wrap;
}

/* ---- lineups panel ---- */
function lineupPanel(m){
  const wrap=h(`<div class="card pad"></div>`);
  wrap.append(h(`<div class="eyebrow" style="margin-bottom:12px">Starting line-ups</div>`));
  wrap.append(formationPitch(m));
  const cols=h(`<div class="grid two-col" style="margin-top:16px"></div>`);
  ['home','away'].forEach(side=>{
    const lu=m.lineups[side]; if(!lu) return;
    const col=h(`<div></div>`);
    col.append(h(`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="dot" style="background:var(--${side})"></span><b>${esc(m[side].name)}</b>
      <span class="muted">${esc(lu.formation)}</span></div>`));
    const subs=lu.players.filter(p=>!p.starter);
    if(subs.length){
      col.append(h(`<div class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:4px 0 6px">Substitutes used</div>`));
      const used=new Set(m.timeline.filter(t=>t.type==='sub'&&t.side===side).map(t=>t.player));
      subs.forEach(p=> col.append(h(`<div style="padding:3px 0;font-size:12.5px;${used.has(p.name)?'':'opacity:.5'}">
        <span class="sh">${esc(p.shirt||'')}</span>${esc(p.name)} ${used.has(p.name)?'<span class="muted">· on</span>':''}</div>`)));
    }
    cols.append(col);
  });
  wrap.append(cols);
  return wrap;
}

/* ---- players panel ---- */
function playersPanel(m){
  const wrap=h(`<div class="card pad" style="overflow-x:auto"></div>`);
  const head=h(`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px"></div>`);
  head.append(h(`<div class="eyebrow">Player statistics</div>`));
  const seg=h(`<div class="seg"></div>`);
  const bh=h(`<button class="home ${state.net==='home'?'on':''}">${esc(m.home.name)}</button>`);
  const ba=h(`<button class="away ${state.net==='away'?'on':''}">${esc(m.away.name)}</button>`);
  bh.onclick=()=>{state.net='home'; render();}; ba.onclick=()=>{state.net='away'; render();};
  seg.append(bh,ba); head.append(seg); wrap.append(head);
  wrap.append(playerTable(m,state.net));
  return wrap;
}

/* ===================================================== CHART BUILDERS === */
/* static pitch svg string (markings), attacking full width */
function pitchMarks(withBg=true){
  const g=cssv('--pitch-line'), f=cssv('--pitch');
  const bx=15.7, by1=13.25, by2=51.75, sx=5.24, sy1=23.75, sy2=41.25, cr=8.7;
  const line=(x1,y1,x2,y2)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${g}" stroke-width=".3"/>`;
  const rect=(x,y,w,ht)=>`<rect x="${x}" y="${y}" width="${w}" height="${ht}" fill="none" stroke="${g}" stroke-width=".3"/>`;
  return `${withBg?`<rect x="0" y="0" width="${PW}" height="${PH}" fill="${f}"/>`:''}
    ${rect(.3,.3,PW-.6,PH-.6)}
    ${line(50,.3,50,PH-.3)}
    <circle cx="50" cy="${PH/2}" r="${cr}" fill="none" stroke="${g}" stroke-width=".3"/>
    <circle cx="50" cy="${PH/2}" r=".5" fill="${g}"/>
    ${rect(.3,by1,bx,by2-by1)} ${rect(.3,sy1,sx,sy2-sy1)}
    ${rect(PW-.3-bx,by1,bx,by2-by1)} ${rect(PW-.3-sx,sy1,sx,sy2-sy1)}
    <circle cx="10.5" cy="${PH/2}" r=".5" fill="${g}"/><circle cx="${PW-10.5}" cy="${PH/2}" r=".5" fill="${g}"/>`;
}
function svgEl(vb,inner,extra=''){ return h(`<div class="pitch-wrap"><svg viewBox="${vb}" ${extra}>${inner}</svg></div>`); }
/* Monochrome series encoding. With no hue available, a second series is carried
   by texture (45° hatch) or by outline — never by another colour. */
let _hid=0;
function hatchPattern(id,col,bgOp=0){
  return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    ${bgOp?`<rect width="4" height="4" fill="${col}" fill-opacity="${bgOp}"/>`:''}
    <rect width="1.7" height="4" fill="${col}"/></pattern>`;
}
const HATCH_CSS='repeating-linear-gradient(45deg,var(--fg) 0 2px,transparent 2px 5px)';
/* cap a pitch's width so full-width panels don't render a huge pitch */
function cap(el,w=840){ el.style.maxWidth=w+'px'; el.style.margin='0 auto'; return el; }

/* shot map: home attacks right, away mirrored to attack left */
/* Monochrome shot map. Two channels, no hue:
     SHAPE   circle = home, square = away
     FILL    solid = on target, hollow = off target, ringed = goal   */
function shotMap(m,big=false){
  let marks='';
  const ink=cssv('--fg'), bg=cssv('--bg');
  const R=v=> (big?2.2:1.8)+Math.sqrt(v)*(big?9:7);
  const shape=(cx,cy,r,home,attrs)=> home
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs}/>`
    : `<rect x="${(cx-r).toFixed(2)}" y="${(cy-r).toFixed(2)}" width="${(r*2).toFixed(2)}" height="${(r*2).toFixed(2)}" ${attrs}/>`;
  m.shots.forEach(s=>{
    if(s.x==null||s.y==null) return;
    const home=s.side==='home';
    const x = home? s.x : 100-s.x;
    const y = home? s.y : 100-s.y;
    const cx=PX(x), cy=PY(y), r=R(s.xg);
    const tt=`${esc(s.name)}||${esc(m[s.side].name)} · ${s.min}'||xG ${s.xg.toFixed(2)} · ${s.body}${s.goal?' · GOAL':s.on_target?' · on target':s.blocked?' · blocked':' · off target'}`;
    if(s.goal){
      marks+=shape(cx,cy,r+1.6,home,`fill="none" stroke="${ink}" stroke-width=".7"`)
           + shape(cx,cy,r,home,`class="shot" data-tt="${tt}" fill="${ink}" stroke="${bg}" stroke-width=".5"`);
    } else {
      marks+=shape(cx,cy,r,home,
        `class="shot" data-tt="${tt}" fill="${s.on_target?ink:'none'}" fill-opacity="${s.on_target?.9:1}" stroke="${ink}" stroke-width=".6"`);
    }
  });
  const el=svgEl(`0 0 ${PW} ${PH}`, pitchMarks()+marks);
  attachShotTT(el);
  return el;
}
function shotLegend(){
  return h(`<div class="legend">
    <span class="it"><svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="var(--fg)"/></svg>${esc(M[state.mi].home.name)}</span>
    <span class="it"><svg width="14" height="14"><rect x="2" y="2" width="10" height="10" fill="var(--fg)"/></svg>${esc(M[state.mi].away.name)}</span>
    <span class="it"><svg width="28" height="14"><circle cx="5" cy="7" r="2.5" fill="var(--fg)"/><circle cx="18" cy="7" r="5.5" fill="var(--fg)"/></svg>∝ xG</span>
    <span class="it"><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="none" stroke="var(--fg)" stroke-width="1"/></svg>off target</span>
    <span class="it"><svg width="16" height="14"><circle cx="8" cy="7" r="6" fill="none" stroke="var(--fg)" stroke-width="1"/><circle cx="8" cy="7" r="3.5" fill="var(--fg)"/></svg>goal</span>
  </div>`);
}

/* cumulative xG step chart */
function xgRace(m){
  const W=100, H=58, PADL=8, PADB=8, PADT=4, PADR=3;
  const maxMin=Math.max(m.lengthMin||95, ...m.shots.map(s=>s.min))+2;
  const series=side=>{
    const pts=m.shots.filter(s=>s.side===side).sort((a,b)=>a.min-b.min);
    let cum=0; const arr=[[0,0]];
    pts.forEach(s=>{cum+=s.xg; arr.push([s.min,cum]);});
    arr.push([maxMin,cum]); return arr;
  };
  const hs=series('home'), as=series('away');
  const maxXg=Math.max(hs[hs.length-1][1], as[as.length-1][1], .5)*1.1;
  const X=mn=> PADL+(W-PADL-PADR)*mn/maxMin;
  const Y=v=> (H-PADB)-(H-PADB-PADT)*v/maxXg;
  const path=arr=>{let d=`M ${X(arr[0][0])} ${Y(arr[0][1])}`;
    for(let i=1;i<arr.length;i++){d+=` L ${X(arr[i][0])} ${Y(arr[i-1][1])} L ${X(arr[i][0])} ${Y(arr[i][1])}`;} return d;};
  const grid=[]; const gstep=maxXg<=1?.25:maxXg<=2?.5:1;
  for(let v=0;v<=maxXg;v+=gstep){grid.push(`<line x1="${PADL}" y1="${Y(v)}" x2="${W-PADR}" y2="${Y(v)}" stroke="${cssv('--grid')}" stroke-width=".25"/>
    <text x="${PADL-1.5}" y="${Y(v)+1.4}" font-size="3" text-anchor="end" fill="${cssv('--muted')}">${v.toFixed(v<1?2:1).replace(/\.00$/,'')}</text>`);}
  const ticks=[]; for(let t=0;t<=maxMin;t+=15){ticks.push(`<text x="${X(t)}" y="${H-2}" font-size="3" text-anchor="middle" fill="${cssv('--muted')}">${t}'</text>`);}
  const goalDots=m.shots.filter(s=>s.goal).map(s=>{
    const arr=s.side==='home'?hs:as; let cum=0; for(const p of arr){if(p[0]<=s.min)cum=p[1];}
    return `<circle cx="${X(s.min)}" cy="${Y(cum)}" r="1.5" fill="${COL(s.side)}" stroke="${cssv('--surface-1')}" stroke-width=".5"/>`;
  }).join('');
  const inner=`${grid.join('')}${ticks.join('')}
    <path d="${path(hs)}" fill="none" stroke="var(--fg)" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="${path(as)}" fill="none" stroke="var(--fg)" stroke-width="1.1" stroke-linejoin="round" stroke-dasharray="2.4 1.6"/>${goalDots}`;
  const el=svgEl(`0 0 ${W} ${H}`, inner, 'style="overflow:visible"');
  const wrap=h(`<div></div>`); wrap.append(el);
  wrap.append(h(`<div class="legend">
    <span class="it"><svg width="24" height="10"><line x1="1" y1="5" x2="23" y2="5" stroke="var(--fg)" stroke-width="2"/></svg>${esc(m.home.name)} ${hs[hs.length-1][1].toFixed(2)}</span>
    <span class="it"><svg width="24" height="10"><line x1="1" y1="5" x2="23" y2="5" stroke="var(--fg)" stroke-width="2" stroke-dasharray="4 3"/></svg>${esc(m.away.name)} ${as[as.length-1][1].toFixed(2)}</span>
    <span class="it">● goal</span></div>`));
  return wrap;
}

/* momentum diverging bars per 5-min window (sqrt-scaled so one spike doesn't flatten the rest) */
function momentumChart(m){
  const W=100,H=42,PADT=6,PADB=7,PADL=3,PADR=3, mid=(PADT+(H-PADB))/2;
  const maxMin=Math.max(m.lengthMin||95,...m.momentum.map(b=>b.min))+5;
  const mhid='mo'+(++_hid);
  const nets=m.momentum.map(b=>({min:b.min,net:b.home-b.away}));
  const sq=v=> Math.sign(v)*Math.sqrt(Math.abs(v));
  const maxAbs=Math.max(.55,...nets.map(b=>Math.abs(sq(b.net))))*1.05;
  const X=mn=>PADL+(W-PADL-PADR)*mn/maxMin;
  const slot=(W-PADL-PADR)/(maxMin/5);
  const bw=slot*0.72;
  const Y=v=> mid - (mid-PADT)*sq(v)/maxAbs;
  let bars='';
  nets.forEach(b=>{
    if(Math.abs(b.net)<1e-4) return;
    const x=X(b.min)+slot*0.14;
    const y=b.net>=0?Y(b.net):mid; const hgt=Math.abs(mid-Y(b.net));
    const fillA = b.net>=0 ? cssv('--fg') : `url(#${mhid})`;
    bars+=`<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(hgt,.15)}" fill="${fillA}" stroke="${cssv('--fg')}" stroke-width=".2"/>`;
  });
  const goals=m.timeline.filter(t=>t.type==='goal').map(t=>
    `<circle cx="${X(t.min)}" cy="${t.side==='home'?PADT-1.5:H-PADB+2}" r="1.1" fill="${COL(t.side)}" stroke="${cssv('--surface-1')}" stroke-width=".3"/>`).join('');
  const ticks=[]; for(let t=0;t<=maxMin;t+=15) ticks.push(`<text x="${X(t)}" y="${H-1}" font-size="2.4" text-anchor="middle" fill="${cssv('--muted')}">${t}'</text>`);
  const inner=`<defs>${hatchPattern(mhid,cssv('--fg'),0)}</defs>
    <line x1="${PADL}" y1="${mid}" x2="${W-PADR}" y2="${mid}" stroke="${cssv('--line')}" stroke-width=".3"/>
    ${bars}${goals}${ticks.join('')}
    <text x="${PADL}" y="${PADT-1.5}" font-size="2.6" font-weight="700" fill="var(--home)">${esc(m.home.name)} ▲</text>
    <text x="${PADL}" y="${H-PADB+3.5}" font-size="2.6" font-weight="700" fill="var(--away)">${esc(m.away.name)} ▼</text>`;
  return svgEl(`0 0 ${W} ${H}`, inner, 'style="overflow:visible;max-height:340px"');
}

/* pass network for one side */
function passNetwork(m,side){
  const pos=m.netPos[side]; const links=m.links[side];
  const col=COL(side);
  const attackHome = side==='home'; // both use raw coords (attacking direction) -> render L->R
  const P=id=>pos[id];
  const maxPass=Math.max(...Object.values(pos).map(p=>p.passes),1);
  const maxLink=Math.max(...links.map(l=>l.c),1);
  let linkS='';
  links.forEach(l=>{const a=P(l.a),b=P(l.b); if(!a||!b)return;
    linkS+=`<line x1="${PX(a.x)}" y1="${PY(a.y)}" x2="${PX(b.x)}" y2="${PY(b.y)}"
      stroke="${col}" stroke-opacity="${.14+.42*l.c/maxLink}" stroke-width="${.25+1.6*l.c/maxLink}" stroke-linecap="round"/>`;});
  let nodeS='';
  Object.values(pos).forEach(p=>{
    if(!p.starter) return;
    const r=1.4+Math.sqrt(p.passes/maxPass)*2.3;
    const short=p.name.split(' ').pop();
    nodeS+=`<circle class="shot" data-tt="${esc(p.name)}||${p.passes} passes||avg pos ${p.x.toFixed(0)},${p.y.toFixed(0)}" cx="${PX(p.x)}" cy="${PY(p.y)}" r="${r}" fill="${col}" fill-opacity=".82" stroke="${cssv('--surface-1')}" stroke-width=".4"/>
      <text x="${PX(p.x)}" y="${PY(p.y)+r+2.2}" font-size="2.3" text-anchor="middle" fill="${cssv('--ink-2')}" style="paint-order:stroke" stroke="${cssv('--pitch')}" stroke-width=".5">${esc(short)}</text>`;
  });
  const el=svgEl(`0 0 ${PW} ${PH}`, pitchMarks()+linkS+nodeS,'style="overflow:visible"');
  attachShotTT(el);
  return el;
}

/* formation pitch: home left(attack right), away right(attack left).
   Lines are assigned from real average x-position (slot numbers are not
   linear def→fwd), then laid out in idealized rows. */
function formationPitch(m){
  const place=(side)=>{
    const lu=m.lineups[side]; if(!lu) return '';
    const starters=lu.players.filter(p=>p.starter);
    const pos=m.netPos[side];
    const ax=p=> pos[p.id]? pos[p.id].x : (p.group==='GK'?6:50);
    const ay=p=> pos[p.id]? pos[p.id].y : 50;
    const gk=starters.find(p=>p.slot==='1')||starters.find(p=>p.group==='GK')||starters[0];
    const out=starters.filter(p=>p!==gk).sort((a,b)=>ax(a)-ax(b)); // low x = defenders
    const rows=(m[side].formation||'').split('-').map(Number).filter(n=>n>0);
    const col=COL(side), home=side==='home', nb=rows.length;
    let idx=0; const placed=[];
    rows.forEach((cnt,ri)=>{
      const xb = home? 14 + ri*(29/Math.max(nb-1,1)) : 86 - ri*(29/Math.max(nb-1,1));
      const grp=out.slice(idx,idx+cnt); idx+=cnt;
      grp.sort((a,b)=>ay(a)-ay(b));
      grp.forEach((p,k)=>{
        let y = cnt===1?50 : 12 + k*(76/(cnt-1));
        if(!home) y = 100 - y;
        placed.push({p,x:xb,y});
      });
    });
    placed.push({p:gk,x:home?6.5:93.5,y:50});
    const stroke=cssv('--pitch');
    return placed.map(({p,x,y})=>`
      <circle cx="${PX(x)}" cy="${PY(y)}" r="3.2" fill="${col}" stroke="${cssv('--surface-1')}" stroke-width=".5"/>
      <text x="${PX(x)}" y="${PY(y)+1.05}" font-size="2.8" text-anchor="middle" fill="var(--bg)" font-weight="700">${esc(p.shirt||'')}</text>
      <text x="${PX(x)}" y="${PY(y)+6}" font-size="2.3" text-anchor="middle" fill="${cssv('--ink-2')}" style="paint-order:stroke" stroke="${stroke}" stroke-width=".6">${esc(p.name.split(' ').pop())}${p.captain?' (C)':''}</text>`).join('');
  };
  const el=svgEl(`0 0 ${PW} ${PH}`, pitchMarks()+place('home')+place('away'),'style="overflow:visible"');
  const wrap=h(`<div></div>`); wrap.append(el);
  wrap.append(h(`<div class="legend"><span class="it"><span class="dot" style="background:var(--home)"></span>${esc(m.home.name)} ${esc(m.home.formation)} →</span>
    <span class="it">← <span class="dot" style="background:var(--away)"></span>${esc(m.away.name)} ${esc(m.away.formation)}</span></div>`));
  return wrap;
}

/* horizontal match timeline with collision-aware lane stacking */
function timelineChart(m){
  const maxMin=Math.max(m.lengthMin||95,...m.timeline.map(t=>t.min))+3;
  const GAP=12;                     // min horizontal spacing (%) before stacking
  const LANE=33;                    // px per stacked lane
  const upRows=[], dnRows=[];
  const events=[...m.timeline].sort((a,b)=>a.min-b.min).map(t=>{
    const x=100*t.min/maxMin, up=t.side==='home', rows=up?upRows:dnRows;
    let r=0; for(;;r++){ if(!rows[r])rows[r]=-99;
      if(x-rows[r]>=GAP){ rows[r]=x; break; } }
    return {t,x,up,row:r};
  });
  const nUp=upRows.length||1, nDn=dnRows.length||1;
  const axisY=nUp*LANE+8;
  const H=axisY+nDn*LANE+18;
  const rows=h(`<div style="position:relative;height:${H}px;margin:4px 6px"></div>`);
  rows.append(h(`<div style="position:absolute;left:0;right:0;top:${axisY}px;height:2px;background:var(--line)"></div>`));
  for(let t=0;t<=maxMin;t+=15){ if(t>maxMin)break; const x=100*t/maxMin;
    rows.append(h(`<div style="position:absolute;left:${x}%;top:${axisY+4}px;transform:translateX(-50%);font-size:9.5px;color:var(--muted)">${t}'</div>`));
    rows.append(h(`<div style="position:absolute;left:${x}%;top:${axisY-3}px;width:1px;height:8px;background:var(--grid)"></div>`));
  }
  events.forEach(({t,x,up,row})=>{
    const col=COL(t.side);
    let bg='var(--surface-1)', bd='var(--border)', ic='⇄', fg='var(--ink-2)';
    if(t.type==='goal'){bg=col;bd=col;ic='⚽';fg='var(--bg)';}
    if(t.type==='card'){ic='';bg=t.card==='yellow'?'var(--bg)':'var(--fg)';bd='var(--fg)';}
    const name=esc(t.player.split(' ').slice(-1)[0]);
    const label = t.type==='goal'? `${name} ${t.min}'${t.own?' (OG)':t.pen?' (P)':''}` : name;
    const top = up ? axisY-24-row*LANE : axisY+8+row*LANE;
    rows.append(h(`<div style="position:absolute;left:${x}%;top:${top}px;transform:translateX(-50%);text-align:center;width:64px">
      <div style="width:19px;height:19px;border-radius:6px;margin:0 auto 2px;display:grid;place-items:center;font-size:10px;background:${bg};border:1px solid ${bd};color:${fg}">${ic}</div>
      <div style="font-size:9px;color:var(--ink-2);line-height:1.15;font-weight:${t.type==='goal'?700:500};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div></div>`));
  });
  const wrap=h(`<div class="tl"></div>`); wrap.append(rows);
  return wrap;
}

/* shot table */
function shotTable(m){
  const box=h(`<div class="card pad" style="overflow-x:auto"></div>`);
  box.append(h(`<div class="eyebrow" style="margin-bottom:10px">Every shot</div>`));
  const t=h(`<table><thead><tr><th>Min</th><th>Team</th><th>Player</th><th>Body</th><th>Outcome</th><th>xG</th></tr></thead><tbody></tbody></table>`);
  const tb=$('tbody',t);
  [...m.shots].sort((a,b)=>a.min-b.min).forEach(s=>{
    const out=s.goal?'<b style="color:var(--good)">Goal</b>':s.on_target?'On target':s.blocked?'Blocked':'Off target';
    tb.append(h(`<tr><td class="tnum">${s.min}'</td>
      <td><span class="dot" style="display:inline-block;background:var(--fg);${s.side==='home'?'border-radius:50% !important':''}"></span> ${esc(m[s.side].code)}</td>
      <td class="name">${esc(s.name)}</td><td>${esc(s.body)}</td><td style="text-align:left">${out}</td>
      <td class="tnum">${s.xg.toFixed(2)}</td></tr>`));
  });
  box.append(t);
  return box;
}

/* player table (sortable) */
function playerTable(m,side){
  const cols=[['name','Player',0],['goals','G',1],['shots','Sh',1],['xg','xG',2],
    ['passes','Pass',1],['pass_pct','Pass%',1],['prog','Prog',1],['tackles','Tkl',1],
    ['intercept','Int',1],['recov','Rec',1],['dribbles','Drb',1],['aerials','Aer',1]];
  const rows=[...m.players[side]];
  const sk=state.sort.key, sd=state.sort.dir;   // dir: 1 asc, -1 desc
  rows.sort((a,b)=> sk==='name'
    ? a.name.localeCompare(b.name)*sd
    : (a[sk]-b[sk])*sd || a.name.localeCompare(b.name));
  const t=h(`<table></table>`);
  const thead=h(`<thead><tr></tr></thead>`); const tr=$('tr',thead);
  cols.forEach(([k,l])=>{const th=h(`<th class="${sk===k?'sorted':''}">${l}${sk===k?(sd<0?' ▾':' ▴'):''}</th>`);
    th.onclick=()=>{ if(state.sort.key===k) state.sort.dir*=-1; else {state.sort.key=k; state.sort.dir=k==='name'?1:-1;} render(); }; tr.append(th);});
  t.append(thead);
  const tb=h(`<tbody></tbody>`);
  rows.forEach(p=>{
    tb.append(h(`<tr style="${p.starter?'':'opacity:.62'}">
      <td class="name"><span class="sh">${esc(p.shirt||'')}</span>${esc(p.name)}${p.captain?' <span class="muted">(C)</span>':''}</td>
      <td class="tnum">${p.goals||''}</td><td class="tnum">${p.shots||''}</td><td class="tnum">${p.xg?p.xg.toFixed(2):''}</td>
      <td class="tnum">${p.passes}</td><td class="tnum">${p.pass_pct?p.pass_pct+'%':''}</td>
      <td class="tnum">${p.prog||''}</td><td class="tnum">${p.tackles||''}</td><td class="tnum">${p.intercept||''}</td>
      <td class="tnum">${p.recov||''}</td><td class="tnum">${p.dribbles||''}</td><td class="tnum">${p.aerials||''}</td></tr>`));
  });
  t.append(tb);
  return t;
}

/* ============================================================ GROUPS ==== */
function Groups(){
  const root=h('<div></div>');
  root.append(h(`<div style="margin:26px 2px 6px">
    <div class="eyebrow">Group stage</div>
    <h2 style="font-size:26px;letter-spacing:-.02em;margin-top:6px">Twelve groups, 72 matches</h2>
    <p class="ink2" style="max-width:660px;margin:8px 0 0">Final standings and results for every group.
      The top two of each group — <b>ruled</b> in the margin — advance, joined by the eight best
      third-placed sides.</p></div>`));
  const grid=h(`<div class="grid two-col" style="margin-top:18px"></div>`);
  Object.keys(AGG.standings).sort().forEach(g=>{
    const rows=AGG.standings[g];
    const card=h(`<div class="card pad" style="margin:-1px 0 0 -1px"></div>`);
    // the group letter set as a display initial — typography as graphic
    card.append(h(`<div style="display:flex;align-items:baseline;gap:14px;margin-bottom:14px;border-bottom:2px solid var(--rule);padding-bottom:10px">
      <span style="font-family:var(--display);font-size:46px;font-weight:700;line-height:.8;letter-spacing:-.04em">${esc(g.replace('Group ',''))}</span>
      <span class="eyebrow">Group</span>
      <span class="footnote" style="margin:0 0 0 auto">Top two advance</span></div>`));
    const t=h(`<table style="font-size:11px"><thead><tr><th style="width:14px"></th><th>Team</th>
      <th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody></tbody></table>`);
    const tb=$('tbody',t);
    // qualification marked by a solid rule, not a tint
    rows.forEach((r,i)=>{const tr=h(`<tr style="cursor:pointer">
      <td class="tnum" style="color:var(--fg-3);border-left:${i<2?'4px solid var(--fg)':'4px solid transparent'};padding-left:7px">${i+1}</td>
      <td class="name" style="${i<2?'font-weight:600':'color:var(--fg-2)'}">${teamBadge(r.code)}${esc(r.name)}</td>
      <td class="tnum">${r.mp}</td><td class="tnum">${r.w}</td><td class="tnum">${r.d}</td><td class="tnum">${r.l}</td>
      <td class="tnum">${r.gf}</td><td class="tnum">${r.ga}</td><td class="tnum">${r.gd>0?'+':''}${r.gd}</td>
      <td class="tnum" style="font-weight:700;font-size:12.5px">${r.pts}</td></tr>`);
      tr.onclick=()=>{state.team=r.id; goView('teams');}; tb.append(tr);});
    const tscroll=h(`<div style="overflow-x:auto"></div>`); tscroll.append(t); card.append(tscroll);
    // results
    const fx=M.filter(m=>m.group===g).sort((a,b)=>a.date<b.date?-1:1);
    const res=h(`<div style="margin-top:12px;display:grid;gap:3px"></div>`);
    fx.forEach(m=>{const [hs,as]=m.score.ft; const r=h(`<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;font-size:11.5px;padding:2px 0;cursor:pointer">
      <span style="text-align:right;${hs>=as?'font-weight:700':'color:var(--muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.home.name)}</span>
      <span class="tnum" style="font-weight:700">${hs}–${as}</span>
      <span style="${as>=hs?'font-weight:700':'color:var(--muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.away.name)}</span></div>`);
      r.onclick=()=>openMatch(idxOf(m)); res.append(r);});
    card.append(res);
    grid.append(card);
  });
  root.append(grid);
  return root;
}

/* ========================================================= KNOCKOUTS ==== */
function Knockouts(){
  const root=h('<div></div>');
  const finalists=M.filter(m=>m.stage==='Semi-finals').sort((a,b)=>a.date<b.date?-1:1).map(winnerName).filter(Boolean);
  root.append(h(`<div style="margin:26px 2px 6px">
    <div class="eyebrow">Knockout stage</div>
    <h2 style="font-size:26px;letter-spacing:-.02em;margin-top:6px">The bracket — round of 32 to the final</h2>
    <p class="ink2" style="max-width:680px;margin:8px 0 0">Winners in bold; scores include extra time, with the 90-minute score and any shootout noted beneath.
      Scroll sideways to follow the draw. Click any tie for its full match report.</p></div>`));
  const wrap=h(`<div class="card pad" style="overflow-x:auto;margin-top:16px"></div>`);
  const stages=[['16th Finals','Round of 32'],['8th Finals','Round of 16'],
    ['Quarter-finals','Quarter-finals'],['Semi-finals','Semi-finals'],['Final','Final']];
  const rowHTML=stages.map(([st,lbl])=>`<div style="min-width:200px;flex:1"><div class="eyebrow" style="margin-bottom:10px">${lbl}</div><div style="display:grid;gap:9px" data-st="${st}"></div></div>`).join('');
  wrap.innerHTML=`<div style="display:flex;gap:16px;min-width:1040px;align-items:start">${rowHTML}</div>`;
  stages.forEach(([st])=>{
    const col=wrap.querySelector(`[data-st="${st}"]`);
    if(st==='Final'){
      const fm=FINAL_M(), tm=THIRD_M();
      if(fm){
        col.append(tieCard(fm,'Final'));
        // the third-place play-off has no bracket line of its own — it hangs here
        if(tm) col.append(tieCard(tm,'Third-place play-off'));
      } else {
        col.append(h(`<div class="card pad" style="padding:12px 13px;border:1px dashed var(--line);background:transparent">
          <div class="muted" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Final · 19 Jul · MetLife</div>
          <div style="display:flex;justify-content:space-between;gap:8px"><span style="font-weight:750">${esc(finalists[0]||'TBD')}</span><span class="muted">vs</span><span style="font-weight:750">${esc(finalists[1]||'TBD')}</span></div>
          <div class="muted" style="font-size:10px;margin-top:4px">to be played</div></div>`));
      }
      return;
    }
    M.filter(m=>m.stage===st).sort((a,b)=>a.date<b.date?-1:1).forEach(m=>col.append(tieCard(m,'')));
  });
  root.append(wrap);
  return root;
}

/* ==================================== team head-to-head ================= */
/* Team-level metrics for the comparison ledger. `dir` +1 = higher is better,
   -1 = lower is better (xG against, PPDA) — the percentile respects it, so the
   bars always read "further out = better". */
const TCAT={att:'Attacking', pos:'Build-up & territory', def:'Defending'};
/* `perf: true` means the metric has a genuine better/worse direction, so a leader
   can be declared. The rest are STYLE metrics — being more direct, or slower, or
   more territorial is not better, just different, and calling a winner on them
   would be meaningless. Only perf metrics get lead emphasis and count in the tally. */
const TCMP=[
  {k:'xgpg',     l:'xG',              g:'att', dir: 1, perf:1, fmt:v=>v.toFixed(2)},
  {k:'shotspg',  l:'Shots',           g:'att', dir: 1, perf:1, fmt:v=>v.toFixed(1)},
  {k:'sotpg',    l:'On target',       g:'att', dir: 1, perf:1, fmt:v=>v.toFixed(1)},
  {k:'xtpg',     l:'xT created',      g:'att', dir: 1, perf:1, fmt:v=>v.toFixed(2)},
  {k:'spshare',  l:'Set-piece xG',    g:'att', dir: 1,         fmt:v=>v.toFixed(0)+'%'},
  {k:'poss',     l:'Possession',      g:'pos', dir: 1,         fmt:v=>v.toFixed(0)+'%'},
  {k:'progpg',   l:'Prog. passes',    g:'pos', dir: 1, perf:1, fmt:v=>v.toFixed(0)},
  {k:'tempo',    l:'Tempo',           g:'pos', dir: 1,         fmt:v=>v.toFixed(1)},
  {k:'longp',    l:'Directness',      g:'pos', dir: 1,         fmt:v=>v.toFixed(1)+'%'},
  {k:'tilt',     l:'Field tilt',      g:'pos', dir: 1,         fmt:v=>v.toFixed(0)+'%'},
  {k:'xgapg',    l:'xG against',      g:'def', dir:-1, perf:1, fmt:v=>v.toFixed(2)},
  {k:'ppda',     l:'Pressing (PPDA)', g:'def', dir:-1,         fmt:v=>v.toFixed(1)},
  {k:'defH',     l:'Def. line',       g:'def', dir: 1,         fmt:v=>v.toFixed(0)},
  {k:'defactpg', l:'Def. actions',    g:'def', dir: 1,         fmt:v=>v.toFixed(0)},
  {k:'aerpct',   l:'Aerials won',     g:'def', dir: 1, perf:1, fmt:v=>v.toFixed(0)+'%'},
  {k:'xtprev',   l:'xT prevented',    g:'def', dir: 1, perf:1, fmt:v=>(v>=0?'+':'')+v.toFixed(2)},
];
const TPERF_N=TCMP.filter(m=>m.perf).length;
const TDIFF_MAPS=[['created','xT created'],['conceded','xT conceded'],['touch','Territory']];

/* ---- xT profile: decompose each side's threat into how much, how, and from where.
   All of it comes off data already shipped — the per-zone xtz grids, per-player carry
   xT, and pass volume — so it needs no extra ETL. Shares use only the POSITIVE cells
   of a zone grid as the denominator: a zone with net-negative xT (backward passes shed
   threat) would otherwise inflate the shares of everything else. */
const XT_PROF=(()=>{
  const o={};
  AGG.teams.forEach(T=>o[T.id]={mp:0,created:0,conceded:0,carry:0,pos:0,central:0,f3:0,deep:0,passes:0});
  M.forEach(m=>['home','away'].forEach(s=>{
    const t=o[m[s].id]; if(!t) return;
    const opp=s==='home'?'away':'home';
    t.mp++;
    t.created += (m.xt&&m.xt[s])||0;
    t.conceded+= (m.xt&&m.xt[opp])||0;
    (m.players[s]||[]).forEach(p=>{ t.carry += p.xtc||0; });
    t.passes  += (m.teamStats[s].pass)||0;
    const g=(m.xtz||{})[s]||[];
    for(let i=0;i<g.length;i++){
      const v=g[i]; if(v<=0) continue;
      const gx=i%HX, gy=Math.floor(i/HX);
      t.pos += v;
      if(gy>=3&&gy<=4) t.central += v;        // central lane (y 37.5-62.5)
      if(gx>=8) t.f3 += v;                    // attacking third (x >= 66.7)
      if(gx<=3) t.deep += v;                  // own third
    }
  }));
  const out={};
  Object.entries(o).forEach(([id,t])=>{
    const n=t.mp||1, pz=t.pos||1;
    out[id]={
      xtc:  t.created/n,                       // xT created per match
      xta:  t.conceded/n,                      // xT conceded per match
      xtp:  (AGG.teams.find(x=>x.id===id)||{tac:{}}).tac.xtprev||0,
      carry:100*t.carry/(t.created||1),        // share of threat from carrying
      cent: 100*t.central/pz,                  // share created through the middle
      f3:   100*t.f3/pz,                       // share created in the final third
      deep: 100*t.deep/pz,                     // share created from own third (build-up)
      eff:  100*t.created/(t.passes||1),       // xT per 100 passes
    };
  });
  return out;
})();
/* percentile arrays over the 48 teams, same shape as TAC_ARR */
const XT_ARR={};
['xtc','xta','xtp','carry','cent','f3','deep','eff'].forEach(k=>
  XT_ARR[k]=Object.values(XT_PROF).map(p=>p[k]).sort((a,b)=>a-b));
function xtPct(k,v,dir){ const arr=XT_ARR[k], n=arr.length; if(n<2) return 50;
  let worse=0; arr.forEach(x=>{ if(dir>0? x<v : x>v) worse++; }); return Math.round(100*worse/(n-1)); }

/* the threat radar — seven axes covering volume, resistance, method and location */
const XT_AXES=[
  {k:'xtc',  label:'xT created',    dir: 1, fmt:v=>v.toFixed(2)},
  {k:'eff',  label:'Threat / 100 passes', dir: 1, fmt:v=>v.toFixed(2)},
  {k:'f3',   label:'Final-third share', dir: 1, fmt:v=>v.toFixed(0)+'%'},
  {k:'cent', label:'Central share', dir: 1, fmt:v=>v.toFixed(0)+'%'},
  {k:'carry',label:'From carries',  dir: 1, fmt:v=>v.toFixed(0)+'%'},
  {k:'xtp',  label:'xT prevented',  dir: 1, fmt:v=>(v>=0?'+':'')+v.toFixed(2)},
  {k:'xta',  label:'xT conceded',   dir:-1, fmt:v=>v.toFixed(2)},
];

/* A − B on the same 12x8 lattice, drawn diverging: solid = A higher, hatched = B. */
function teamDiffMap(A,B,which){
  let ga,gb,ttl;
  if(which==='touch'){
    ga=teamAvgHeat(A).map(v=>v/(A.mp||1)); gb=teamAvgHeat(B).map(v=>v/(B.mp||1));
    ttl='Touch difference per match';
  } else {
    ga=teamXtz(A,which); gb=teamXtz(B,which);
    ttl=`xT ${which} difference per match`;
  }
  // qnorm here too: one lopsided zone otherwise sets the scale and flattens every
  // other difference to near-invisible
  return heatSvg(ga.map((v,i)=>v-gb[i]), cssv('--fg'),
    {mode:'div', hatchNeg:true, grid:true, qnorm:true, dec:3, ttl});
}

function teamComparePanel(){
  const wrap=h(`<div></div>`);
  const teams=[...AGG.teams].sort((a,b)=>a.name.localeCompare(b.name));
  const byId=id=>teams.find(t=>t.id===id);
  let A=byId(state.tcA), B=byId(state.tcB);
  if(!A||!B){
    // default to the two finalists — the most interesting pairing on offer
    const f=FINAL_M();
    A=A||(f&&byId(f.home.id))||teams[0];
    B=B||(f&&byId(f.away.id))||teams.find(t=>t.id!==A.id);
  }
  // the pickers exclude the other side, but a deep-link can still name one team
  // twice — comparing a side with itself is a zeroed-out, meaningless panel
  if(A.id===B.id) B=teams.find(t=>t.id!==A.id);
  state.tcA=A.id; state.tcB=B.id;

  // ---- pickers
  const bar=h(`<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:16px 0 14px" class="lg-bar"></div>`);
  const mkSel=(cur,other,set)=>{
    const s=h(`<select class="lg-sel"></select>`);
    teams.forEach(t=>{ if(t.id===other) return;
      s.append(h(`<option value="${esc(t.id)}" ${t.id===cur?'selected':''}>${esc(t.name)}</option>`));});
    s.onchange=()=>{set(s.value); render();};
    return s;
  };
  bar.append(mkSel(A.id,B.id,v=>state.tcA=v));
  const swap=h(`<button class="icon-btn" title="Swap teams" aria-label="Swap teams">⇄</button>`);
  swap.onclick=()=>{const t=state.tcA; state.tcA=state.tcB; state.tcB=t; render();};
  bar.append(swap);
  bar.append(mkSel(B.id,A.id,v=>state.tcB=v));
  wrap.append(bar);

  const card=h(`<div class="card pad"></div>`);
  const rec=T=>`${T.w}W ${T.d}D ${T.l}L · ${T.gf}–${T.ga}`;
  const heads=h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" class="two-col"></div>`);
  [[A,'solid'],[B,'dash']].forEach(([T,style])=>{
    heads.append(h(`<div style="display:flex;align-items:center;gap:10px">
      <span class="lg-key ${style}"></span>${teamBadge(T.code)}
      <div style="min-width:0"><div style="font-size:16px;font-weight:750">${esc(T.name)}</div>
      <div class="muted" style="font-size:11.5px">${T.mp} matches · ${rec(T)}</div></div></div>`));
  });
  card.append(heads);

  const cols=h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px" class="two-col"></div>`);

  // ---- left: radar (style or threat) + identity tags
  const left=h(`<div></div>`);
  const rseg=h(`<div class="subtabs" style="margin-bottom:12px"></div>`);
  [['style','Style'],['threat','Threat (xT)']].forEach(([k,l])=>{
    const b=h(`<button class="${state.tRadar===k?'on':''}">${l}</button>`);
    b.onclick=()=>{state.tRadar=k; render();}; rseg.append(b);});
  left.append(rseg);

  const threat = state.tRadar==='threat';
  const axes = threat ? XT_AXES : STYLE_AXES;
  left.append(overlayRadar(axes.map(ax=>{
    const va = threat ? XT_PROF[A.id][ax.k] : A.tac[ax.k];
    const vb = threat ? XT_PROF[B.id][ax.k] : B.tac[ax.k];
    const a  = threat ? xtPct(ax.k,va,ax.dir) : tacPct(ax.k,va,ax.dir);
    const b  = threat ? xtPct(ax.k,vb,ax.dir) : tacPct(ax.k,vb,ax.dir);
    return {l:ax.label, sub:`${ax.fmt(va)} · ${ax.fmt(vb)}`, a, b};
  })));
  left.append(h(`<div class="legend" style="justify-content:center;margin-top:2px">
    <span class="it"><span class="lg-key solid"></span>${esc(A.name)}</span>
    <span class="it"><span class="lg-key dash"></span>${esc(B.name)}</span></div>`));
  left.append(h(`<div class="footnote">Spoke length is the <b>percentile</b> against the 48-team field, so
    further out is always the more extreme side of that trait; the numbers under each label are the raw
    values for <b>${esc(A.name)} · ${esc(B.name)}</b>.
    ${threat?`Every axis is derived from the tournament-fitted xT surface. <i>Threat / 100 passes</i> is
      efficiency rather than volume; <i>final-third</i>, <i>central</i> and <i>from carries</i> are shares of
      a side's own threat, so they describe <b>how</b> it is generated, not how much. <i>xT conceded</i> is
      inverted — further out means less threat allowed.`
     :`These are shape-of-play traits, not quality: further out is not automatically better.`}</div>`));
  const tagRow=(T,style)=>{
    const b=h(`<div style="margin-top:12px"></div>`);
    b.append(h(`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span class="lg-key ${style}"></span>
      <span style="font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">${esc(T.name)}</span></div>`));
    const cw=h(`<div style="display:flex;flex-wrap:wrap;gap:6px"></div>`);
    const tags=styleTags(T);
    if(!tags.length) cw.append(h(`<span class="muted" style="font-size:12px">no strong identity</span>`));
    tags.forEach(t=>cw.append(h(`<span class="chip">${esc(t)}</span>`)));
    b.append(cw); return b;
  };
  left.append(h(`<div class="eyebrow" style="margin-top:16px">Tactical identity</div>`));
  left.append(tagRow(A,'solid')); left.append(tagRow(B,'dash'));
  cols.append(left);

  // ---- right: metric ledger
  const right=h(`<div></div>`);
  right.append(h(`<div class="eyebrow" style="margin-bottom:8px">Metric by metric</div>`));
  const tbl=h(`<div style="display:grid;gap:2px"></div>`);
  let winA=0,winB=0;
  Object.entries(TCAT).forEach(([k,label])=>{
    const set=TCMP.filter(m=>m.g===k); if(!set.length) return;
    const c=CAT[k];
    tbl.append(h(`<div style="display:flex;align-items:center;gap:7px;margin:9px 0 3px">
      <span class="dot" style="background:${c.hatch?'none':c.css};${c.hatch?'background-image:'+HATCH_CSS+';border:1px solid var(--fg)':''}"></span>
      <span style="font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">${esc(label)}</span></div>`));
    set.forEach(m=>{
      const va=A.tac[m.k], vb=B.tac[m.k];
      const pa=tacPct(m.k,va,m.dir), pb=tacPct(m.k,vb,m.dir);
      // style metrics get no winner — see TCMP
      const lead = (!m.perf || pa===pb) ? 0 : (pa>pb?-1:1);
      if(m.perf){ if(lead<0)winA++; else if(lead>0)winB++; }
      const row=cmpRow(m.l, m.fmt(va), m.fmt(vb), pa, pb, lead);
      if(!m.perf) row.classList.add('style-row');
      tbl.append(row);
    });
  });
  right.append(tbl);
  right.append(h(`<div class="lg-tally"><b class="tnum">${winA}</b> ${esc(A.name)}
    &nbsp;·&nbsp; <b class="tnum">${winB}</b> ${esc(B.name)}
    <span class="muted"> — performance metrics led, of ${TPERF_N}</span></div>`));
  right.append(h(`<div class="footnote">Outer number is the per-match value, the bar is the percentile vs
    the 48-team field. For <b>xG against</b> lower is better, so that percentile inverts — a longer bar is
    still the better side. Greyed rows are <b>style</b> metrics: being more direct, or slower, or higher
    pressing is not better, just different, so they carry no leader and are left out of the tally.</div>`));
  cols.append(right);
  card.append(cols);

  // ---- head-to-head, if they actually met
  const met=M.filter(m=>(m.home.id===A.id&&m.away.id===B.id)||(m.home.id===B.id&&m.away.id===A.id))
    .sort((a,b)=>a.date<b.date?-1:1);
  if(met.length){
    const hh=h(`<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--rule)"></div>`);
    hh.append(h(`<div class="eyebrow" style="margin-bottom:9px">They met${met.length>1?` · ${met.length} times`:''}</div>`));
    met.forEach(m=>{
      const sc=m.score, tag=sc.aet?' AET':(sc.pens?` · pens ${sc.pens[0]}–${sc.pens[1]}`:'');
      const row=h(`<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;
        padding:7px 0;border-bottom:1px solid var(--grid);cursor:pointer;font-size:13px">
        <span style="text-align:right;font-weight:${sc.ft[0]>sc.ft[1]?750:500}">${esc(m.home.name)}</span>
        <span class="tnum" style="font-weight:750">${sc.ft[0]}–${sc.ft[1]}</span>
        <span style="font-weight:${sc.ft[1]>sc.ft[0]?750:500}">${esc(m.away.name)}</span></div>`);
      row.onclick=()=>openMatch(idxOf(m));
      hh.append(row);
      hh.append(h(`<div class="muted" style="font-size:10.5px;margin:-2px 0 6px">${esc(STAGE_LABEL[m.stage]||m.stage)} · ${esc(fmtDate(m.date))}${tag}</div>`));
    });
    card.append(hh);
  }
  wrap.append(card);

  // ---- spatial differential
  const sp=h(`<div class="card pad" style="margin-top:16px"></div>`);
  const tabs=h(`<div class="subtabs" style="margin-bottom:12px"></div>`);
  TDIFF_MAPS.forEach(([k,l])=>{const b=h(`<button class="${state.tcmap===k?'on':''}">${l}</button>`);
    b.onclick=()=>{state.tcmap=k; render();}; tabs.append(b);});
  sp.append(tabs);
  const cap={created:'Where each side creates threat from',
             conceded:'Where each side is opened up',
             touch:'Where each side has the ball'}[state.tcmap];
  sp.append(h(`<div class="eyebrow" style="margin-bottom:8px">${esc(cap)}
    <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· per match · both attacking left → right</span></div>`));
  sp.append(cap2(teamDiffMap(A,B,state.tcmap)));
  const worse = state.tcmap==='conceded';
  sp.append(h(`<div class="footnote"><b>Solid</b> = ${esc(A.name)} higher in that zone,
    <b>hatched</b> = ${esc(B.name)} higher. ${worse?`On this map higher is <i>worse</i> — solid marks zones
      ${esc(A.name)} is opened up from more than ${esc(B.name)} is.`:''}
    Cells are the difference of the two per-match maps, so an empty-looking cell means the two sides are
    alike there, not that nothing happens. Hover any cell for the exact difference.</div>`));
  wrap.append(sp);
  return wrap;
}
const cap2=el=>{ el.style.maxWidth='760px'; el.style.margin='0 auto'; return el; };
/* Dossier / Compare switch, shared by both Teams modes */
function teamModeSeg(){
  const seg=h(`<div class="subtabs" style="margin:14px 0 2px"></div>`);
  [['dossier','Dossier'],['compare','Compare']].forEach(([k,l])=>{
    const b=h(`<button class="${state.tMode===k?'on':''}">${l}</button>`);
    b.onclick=()=>{state.tMode=k; render(); scrollTo(0,0);}; seg.append(b);});
  return seg;
}

/* ============================================================= TEAMS ==== */
function Teams(){
  const root=h('<div></div>');
  const teams=[...AGG.teams].sort((a,b)=>a.name.localeCompare(b.name));
  // default: a finalist, else deepest runner, else first
  if(!state.team){
    const fin=M.filter(m=>m.stage==='Semi-finals').map(winnerName).filter(Boolean);
    const byName=n=>AGG.teams.find(t=>t.name===n);
    state.team=(fin[0]&&byName(fin[0])||[...AGG.teams].sort((a,b)=>b.mp-a.mp)[0]).id;
  }
  const T=AGG.teams.find(t=>t.id===state.team)||teams[0];

  if(state.tMode==='compare'){
    root.append(h(`<div style="margin:26px 2px 6px">
      <div class="eyebrow">Team comparison</div>
      <h2 style="font-size:26px;letter-spacing:-.02em;margin-top:6px">Side by side</h2>
      <p class="ink2" style="max-width:680px;margin:8px 0 0">Put any two nations on the same percentile axes,
        then see where on the pitch they actually differ.</p></div>`));
    root.append(teamModeSeg());
    root.append(teamComparePanel());
    return root;
  }

  const head=h(`<div style="margin:26px 2px 6px;display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap"></div>`);
  head.append(h(`<div><div class="eyebrow">Team dossier</div>
    <h2 style="font-size:26px;letter-spacing:-.02em;margin-top:6px;display:flex;align-items:center;gap:12px">${teamBadge(T.code)}${esc(T.name)}</h2></div>`));
  const sel=h(`<select style="font:inherit;font-weight:600;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface-1);color:var(--ink);cursor:pointer"></select>`);
  teams.forEach(t=>{const o=h(`<option value="${t.id}" ${t.id===T.id?'selected':''}>${esc(t.name)}</option>`); sel.append(o);});
  sel.onchange=()=>{state.team=sel.value; render(); scrollTo(0,0);};
  head.append(sel); root.append(head);
  root.append(teamModeSeg());

  // journey
  const runs=M.filter(m=>m.home.id===T.id||m.away.id===T.id).sort((a,b)=>a.date<b.date?-1:1);
  let gf=0,ga=0,xgf=0,xga=0,poss=0,sot=0,w=0,dr=0,l=0;
  const journey=runs.map(m=>{
    const home=m.home.id===T.id; const side=home?'home':'away', opp=home?'away':'home';
    const g=m.score.ft[home?0:1], og=m.score.ft[home?1:0];
    gf+=g; ga+=og; xgf+=m.teamStats[side].xg; xga+=m.teamStats[opp].xg;
    poss+=m.teamStats[side].possession; sot+=m.teamStats[side].sot;
    if(g>og)w++; else if(g<og)l++; else dr++;
    return {m,side,opp,g,og,opp_name:m[opp].name,i:idxOf(m)};
  });
  const n=runs.length||1;
  // now the tournament is complete, the last match tells you the finishing position
  // rather than just a round — "3rd Place Final" is not something a side "reached"
  const deepest=(()=>{
    if(!runs.length) return '—';
    const last=runs[runs.length-1], won=winnerName(last)===T.name;
    if(last.stage==='Final') return won?'Winners':'Runners-up';
    if(last.stage==='3rd Place Final') return won?'Third place':'Fourth place';
    return STAGE_LABEL[last.stage]||last.stage;
  })();
  const tiles=h(`<div class="tiles" style="margin-top:16px"></div>`);
  [['Record',`${w}W ${dr}D ${l}L`,`${runs.length} matches`],
   ['Goals',`${gf}–${ga}`,'scored / conceded'],
   ['xG balance',`${xgf.toFixed(1)} / ${xga.toFixed(1)}`,`${gf-xgf>=0?'+':''}${(gf-xgf).toFixed(1)} vs model`],
   ['Reached',deepest,`${pct(poss/n)} avg possession`]]
   .forEach(([k,v,d])=>tiles.append(h(`<div class="card tile"><div class="k">${k}</div><div class="v tnum" style="font-size:${String(v).length>7?'22':'30'}px">${v}</div><div class="d">${d}</div></div>`)));
  root.append(tiles);

  root.append(h(`<div class="section-h"><h2>Tactical profile</h2><span class="note">playing style across the tournament</span></div>`));
  root.append(teamTactical(T));

  root.append(h(`<div class="section-h"><h2>Territory &amp; threat</h2><span class="note">average heat map · expected threat generated and prevented</span></div>`));
  root.append(teamSpatial(T));

  root.append(h(`<div class="section-h"><h2>Campaign</h2><span class="note">click a match to open it</span></div>`));
  const rail=h(`<div style="display:grid;gap:9px"></div>`);
  journey.forEach(j=>{
    const win=j.g>j.og, draw=j.g===j.og;
    const res=win?'W':draw?'D':'L';
    // monochrome result mark: won = solid ink, drawn = outline, lost = hatched
    const rc = win  ? 'background:var(--fg);color:var(--bg)'
             : draw ? 'border:1px solid var(--fg);color:var(--fg)'
                    : 'background-image:repeating-linear-gradient(45deg,var(--fg) 0 2px,transparent 2px 4px);border:1px solid var(--fg);color:var(--fg)';
    const xgF=j.m.teamStats[j.side].xg, xgA=j.m.teamStats[j.opp].xg;
    const card=h(`<div class="card" style="padding:11px 15px;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center"></div>`);
    card.onclick=()=>openMatch(j.i);
    card.innerHTML=`
      <span style="width:26px;height:26px;display:grid;place-items:center;font-family:var(--mono);font-size:11px;font-weight:700;${rc}">${res}</span>
      <div style="min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.opp_name)}</div>
        <div class="muted" style="font-size:11px">${esc(STAGE_LABEL[j.m.stage]||j.m.stage)}${j.m.group?' · '+esc(j.m.group):''} · ${esc(fmtDate(j.m.date))}</div></div>
      <span class="tnum" style="font-size:19px;font-weight:800">${j.g}–${j.og}</span>
      <span style="text-align:right;font-size:11px;color:var(--muted);min-width:96px">xG <b class="tnum" style="color:var(--ink-2)">${xgF.toFixed(2)}</b> – <b class="tnum" style="color:var(--ink-2)">${xgA.toFixed(2)}</b></span>`;
    rail.append(card);
  });
  root.append(rail);

  root.append(h(`<div class="section-h"><h2>Top performers</h2><span class="note">${esc(T.name)} players across the tournament</span></div>`));
  const sq=AGG.players.filter(p=>p.code===T.code);
  const grid=h(`<div class="grid two-col"></div>`);
  const board=(title,key,dec)=>{
    const rs=sq.filter(p=>p[key]>0).sort((a,b)=>b[key]-a[key]).slice(0,6);
    const mx=Math.max(...rs.map(r=>r[key]),1);
    const c=h(`<div class="card pad"></div>`); c.append(h(`<div class="eyebrow" style="margin-bottom:12px">${title}</div>`));
    if(!rs.length) c.append(h(`<div class="muted" style="font-size:12px">—</div>`));
    rs.forEach(p=>c.append(h(`<div style="display:grid;grid-template-columns:1fr 110px auto;gap:10px;align-items:center;padding:5px 0">
      <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
      <span class="lb-bar" style="width:${Math.max(8,100*p[key]/mx)}%"></span>
      <span class="tnum" style="font-weight:700;width:40px;text-align:right">${dec?p[key].toFixed(dec):p[key]}</span></div>`)));
    return c;
  };
  // the two xT boards sit as a pair — created and prevented read as a matched set
  grid.append(board('Goals','goals',0),board('Expected goals','xg',2),
    board('xT generated','xt',2),board('xT prevented','xtp',2),
    board('Progressive passes','prog',0),board('Ball recoveries','recov',0));
  root.append(grid);
  return root;
}

/* ============================================================ PLAYERS === */
// derived per-player fields
AGG.players.forEach(p=>{ p._def=p.tackles+p.intercept; p._passpct=p.passes?100*p.passOk/p.passes:0; });
const PCOLS=[
  {k:'group',l:'Pos',t:'pos'},{k:'min',l:'Min',t:'tot'},
  {k:'goals',l:'Gls',t:'p90',dec:2},{k:'npxg',l:'npxG',t:'p90',dec:2},{k:'xa',l:'xA',t:'p90',dec:2},
  {k:'shots',l:'Sh',t:'p90',dec:1},
  {k:'xt',l:'xT',t:'p90',dec:2},{k:'xtp',l:'xTprv',t:'p90',dec:2},{k:'carries',l:'Carr',t:'p90',dec:1},
  {k:'prog',l:'Prog',t:'p90',dec:1},{k:'_def',l:'Tkl+Int',t:'p90',dec:1},{k:'recov',l:'Rec',t:'p90',dec:1},
  {k:'dribbles',l:'Drb',t:'p90',dec:1},{k:'aerials',l:'Aer',t:'p90',dec:1},{k:'_passpct',l:'Pass%',t:'pct'},
];
/* metrics that stay fractional when the table shows totals rather than per-90 */
const P_FRACTIONAL=new Set(['npxg','xa','xt','xtp','xg']);
const pVal=(p,c)=> c.t==='p90'? (state.pPer90? per90(p[c.k],p.min): p[c.k]) : p[c.k];
const pFmt=(p,c)=>{ if(c.t==='pos') return p.group; if(c.t==='tot') return Math.round(p.min);
  if(c.t==='pct') return p._passpct.toFixed(0)+'%';
  const v=pVal(p,c);
  // round-trip through Number so a tiny negative doesn't render as "-0.00"
  // (xT can be slightly negative — a player whose passing shed threat on balance)
  if(state.pPer90) return (+v.toFixed(c.dec)).toFixed(c.dec);
  // Totals: inherently fractional metrics keep their decimals, counting stats round.
  // (This used to test c.k==='xg', a key no column has — so every total was rounded,
  // rendering npxG 4.7 as "5" while the sort still used the true value.)
  return P_FRACTIONAL.has(c.k) ? v.toFixed(2) : Math.round(v); };

/* ============================= player scatter ========================== */
// axis choices: every numeric player column (position/label columns excluded)
const SCATTER_METRICS=[
  {k:'min',l:'Minutes'},{k:'goals',l:'Goals'},{k:'npxg',l:'npxG'},{k:'xa',l:'xA'},
  {k:'shots',l:'Shots'},{k:'xt',l:'xT created'},{k:'xtp',l:'xT prevented'},
  {k:'carries',l:'Carries'},{k:'prog',l:'Progressive passes'},{k:'_def',l:'Tackles + interceptions'},
  {k:'recov',l:'Recoveries'},{k:'dribbles',l:'Dribbles'},{k:'aerials',l:'Aerials won'},
  {k:'_passpct',l:'Pass %'},
];
// a metric's value for a player, honouring the Per-90 / Totals toggle. Minutes and
// pass % are inherently non-per-90, so they ignore it.
function smVal(p,k){
  if(k==='min') return p.min;
  if(k==='_passpct') return p._passpct;
  const raw=p[k]||0;
  return state.pPer90 ? per90(raw,p.min) : raw;
}
const smFmt=(v,k)=> k==='_passpct' ? v.toFixed(0)+'%' : (k==='min'||(!state.pPer90&&k!=='_passpct')) ? Math.round(v).toString() : (+v.toFixed(2)).toFixed(2);

function scatterPanel(){
  const wrap=h(`<div></div>`);
  const mById=k=>SCATTER_METRICS.find(m=>m.k===k)||SCATTER_METRICS[0];
  if(!SCATTER_METRICS.some(m=>m.k===state.pxk)) state.pxk='npxg';
  if(!SCATTER_METRICS.some(m=>m.k===state.pyk)) state.pyk='xa';
  const MX=mById(state.pxk), MY=mById(state.pyk);

  // ---- axis pickers + the shared pos / per90 / min / search filters
  const bar=h(`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:16px 0 6px"></div>`);
  const axisSel=(cur,set,label)=>{
    const g=h(`<label style="display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--fg-2)">${label}</label>`);
    const s=h(`<select style="font:inherit;font-weight:600;padding:6px 9px;border-radius:9px;border:1px solid var(--border);background:var(--surface-1);color:var(--ink);cursor:pointer"></select>`);
    SCATTER_METRICS.forEach(m=>s.append(h(`<option value="${m.k}" ${m.k===cur?'selected':''}>${esc(m.l)}</option>`)));
    s.onchange=()=>{set(s.value); render();}; g.append(s); return g;
  };
  bar.append(axisSel(state.pyk,v=>state.pyk=v,'Y'));
  bar.append(axisSel(state.pxk,v=>state.pxk=v,'X'));
  const swap=h(`<button class="icon-btn" title="Swap axes" aria-label="Swap axes">⇄</button>`);
  swap.onclick=()=>{const t=state.pxk; state.pxk=state.pyk; state.pyk=t; render();};
  bar.append(swap);
  const posSeg=h(`<div class="seg"></div>`);
  [['all','All'],['GK','GK'],['DEF','DEF'],['MID','MID'],['FWD','FWD']].forEach(([k,l])=>{
    const b=h(`<button class="${state.pPos===k?'on neu':''}">${l}</button>`);
    b.onclick=()=>{state.pPos=k; render();}; posSeg.append(b);});
  bar.append(posSeg);
  const p90Seg=h(`<div class="seg"></div>`);
  [['Per 90',true],['Totals',false]].forEach(([l,v])=>{
    const b=h(`<button class="${state.pPer90===v?'on neu':''}">${l}</button>`);
    b.onclick=()=>{state.pPer90=v; render();}; p90Seg.append(b);});
  bar.append(p90Seg);
  const minSel=h(`<select style="font:inherit;font-weight:600;padding:7px 10px;border-radius:9px;border:1px solid var(--border);background:var(--surface-1);color:var(--ink);cursor:pointer"></select>`);
  [[90,'≥ 90 min'],[180,'≥ 180 min'],[270,'≥ 270 min'],[450,'≥ 450 min']].forEach(([v,l])=>
    minSel.append(h(`<option value="${v}" ${state.pMin===v?'selected':''}>${l}</option>`)));
  minSel.onchange=()=>{state.pMin=+minSel.value; render();}; bar.append(minSel);
  const search=h(`<input placeholder="Highlight player / team" value="${esc(state.pSearch)}" style="font:inherit;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--surface-1);color:var(--ink);flex:1;min-width:150px">`);
  search.oninput=()=>{state.pSearch=search.value; render();};
  bar.append(search);
  wrap.append(bar);

  const rows=AGG.players.filter(p=>p.min>=state.pMin && (state.pPos==='all'||p.group===state.pPos));
  const card=h(`<div class="card pad"></div>`);
  if(rows.length<2){ card.append(h(`<div class="muted" style="padding:24px;text-align:center">Not enough players at this filter to plot.</div>`)); wrap.append(card); return wrap; }
  card.append(scatterSvg(rows,MX,MY));
  card.append(h(`<div class="footnote">${rows.length} players · dot size = minutes played · dashed lines are the median ${esc(MX.l.toLowerCase())} and ${esc(MY.l.toLowerCase())} of those shown.
    ${state.pPer90?'Per 90.':'Season totals.'} Search highlights matching dots. Click any dot for the full profile.</div>`));
  wrap.append(card);
  return wrap;
}

function scatterSvg(rows,MX,MY){
  // plot box in SVG units; y grows down, so value axis is inverted
  const L=13, R=118, T=6, B=64, PW2=R-L, PH2=B-T;
  const xs=rows.map(p=>smVal(p,MX.k)), ys=rows.map(p=>smVal(p,MY.k));
  const ext=(arr)=>{ let lo=Math.min(...arr), hi=Math.max(...arr); if(lo===hi){lo-=1;hi+=1;} const pad=(hi-lo)*0.06; return [lo-pad, hi+pad]; };
  const [x0,x1]=ext(xs), [y0,y1]=ext(ys);
  const px=v=>L+(v-x0)/(x1-x0)*PW2, py=v=>B-(v-y0)/(y1-y0)*PH2;
  const med=arr=>{const s=[...arr].sort((a,b)=>a-b),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
  const mx=med(xs), my=med(ys), maxMin=Math.max(...rows.map(p=>p.min),1);
  const grid=cssv('--grid'), muted=cssv('--muted'), ink=cssv('--fg'), ink2=cssv('--ink-2');

  // axis ticks (4 per axis, "nice"-ish)
  const ticks=(lo,hi)=>{const step=(hi-lo)/4; return [0,1,2,3,4].map(i=>lo+step*i);};
  const fmtT=(v,k)=> k==='_passpct'?Math.round(v)+'%':(Math.abs(v)>=100?Math.round(v):(Math.abs(v)>=10?v.toFixed(0):v.toFixed(1)));
  let ax=`<rect x="${L}" y="${T}" width="${PW2}" height="${PH2}" fill="none" stroke="${grid}" stroke-width=".3"/>`;
  ticks(x0,x1).forEach(v=>{const X=px(v);
    ax+=`<line x1="${X.toFixed(1)}" y1="${T}" x2="${X.toFixed(1)}" y2="${B}" stroke="${grid}" stroke-width=".2"/>
      <text x="${X.toFixed(1)}" y="${B+3.4}" font-size="2.4" text-anchor="middle" fill="${muted}">${fmtT(v,MX.k)}</text>`;});
  ticks(y0,y1).forEach(v=>{const Y=py(v);
    ax+=`<line x1="${L}" y1="${Y.toFixed(1)}" x2="${R}" y2="${Y.toFixed(1)}" stroke="${grid}" stroke-width=".2"/>
      <text x="${L-1.5}" y="${(Y+0.9).toFixed(1)}" font-size="2.4" text-anchor="end" fill="${muted}">${fmtT(v,MY.k)}</text>`;});
  // median crosshair (the quadrant divider)
  ax+=`<line x1="${px(mx).toFixed(1)}" y1="${T}" x2="${px(mx).toFixed(1)}" y2="${B}" stroke="${ink}" stroke-width=".3" stroke-dasharray="1.4 1.4" stroke-opacity=".55"/>
    <line x1="${L}" y1="${py(my).toFixed(1)}" x2="${R}" y2="${py(my).toFixed(1)}" stroke="${ink}" stroke-width=".3" stroke-dasharray="1.4 1.4" stroke-opacity=".55"/>`;
  // axis titles
  ax+=`<text x="${(L+R)/2}" y="${B+6.6}" font-size="2.9" font-weight="700" text-anchor="middle" fill="${ink2}">${esc(MX.l)}${state.pPer90&&MX.k!=='_passpct'&&MX.k!=='min'?' / 90':''}</text>
    <text x="${-(T+B)/2}" y="${4.2}" font-size="2.9" font-weight="700" text-anchor="middle" transform="rotate(-90)" fill="${ink2}">${esc(MY.l)}${state.pPer90&&MY.k!=='_passpct'&&MY.k!=='min'?' / 90':''}</text>`;

  const q=state.pSearch.trim().toLowerCase();
  const hit=p=> q && (p.name.toLowerCase().includes(q)||p.team.toLowerCase().includes(q));
  // draw non-highlighted first, highlighted on top
  const pts=rows.map(p=>({p,X:px(smVal(p,MX.k)),Y:py(smVal(p,MY.k)),r:0.55+Math.sqrt(p.min/maxMin)*1.0,hl:hit(p)}));
  let dots='';
  pts.filter(d=>!d.hl).forEach(d=>{ dots+=dot(d,ink,false); });
  pts.filter(d=>d.hl).forEach(d=>{ dots+=dot(d,ink,true); });

  // labels: greedy, most "prominent" first (farthest from the field median), skip on
  // collision so the plot doesn't turn to mush. A search always labels its matches.
  const norm=(v,lo,hi)=>(v-lo)/((hi-lo)||1);
  const scored=pts.map(d=>({d, s:(d.hl?9:0)+Math.hypot(norm(smVal(d.p,MX.k),x0,x1)-norm(mx,x0,x1), norm(smVal(d.p,MY.k),y0,y1)-norm(my,y0,y1))}))
    .sort((a,b)=>b.s-a.s);
  const placed=[]; let labels='';
  const collide=(bx)=>placed.some(o=>Math.abs(o.x-bx.x)<bx.w/2+o.w/2 && Math.abs(o.y-bx.y)<2.6);
  let n=0;
  for(const {d,s} of scored){
    if(n>=16 && !d.hl) break;
    const nm=d.p.name.split(' ').pop();
    const w=nm.length*1.35+1, right=d.X<(L+R)/2;
    const bx={x:d.X+(right?w/2+2:-w/2-2), y:d.Y, w};
    if(!d.hl && collide(bx)) continue;
    labels+=`<text x="${(d.X+(right?2:-2)).toFixed(1)}" y="${(d.Y+0.9).toFixed(1)}" font-size="2.5" font-weight="${d.hl?700:600}" text-anchor="${right?'start':'end'}" fill="${d.hl?ink:ink2}" style="paint-order:stroke" stroke="${cssv('--bg')}" stroke-width=".7">${esc(nm)}</text>`;
    placed.push(bx); n++;
  }

  const el=svgEl(`-2 0 128 76`, ax+dots+labels, 'style="overflow:visible"');
  attachShotTT(el);
  const svg=$('svg',el);
  svg.style.cursor='default';
  svg.addEventListener('click',e=>{ const t=e.target;
    if(t.classList&&t.classList.contains('scatter-dot')&&t.dataset.pid){
      state.pMode='table'; state.pPlayer=t.dataset.pid; render(); scrollTo(0,0);
    }});
  return cap(el, 900);
}
function dot(d,ink,hl){
  const tt=`${esc(d.p.name)} · ${esc(d.p.team)}||${SCATTER_METRICS.find(m=>m.k===state.pxk).l}: ${smFmt(smVal(d.p,state.pxk),state.pxk)}||${SCATTER_METRICS.find(m=>m.k===state.pyk).l}: ${smFmt(smVal(d.p,state.pyk),state.pyk)}`;
  // base dots are semi-transparent ink so dense regions read as darkness rather than a
  // hairball of overlapping rings; a highlighted/searched dot is solid with a knock-out ring
  return `<circle class="shot scatter-dot" data-pid="${esc(d.p.id)}" data-tt="${tt}" cx="${d.X.toFixed(1)}" cy="${d.Y.toFixed(1)}" r="${(hl?d.r+0.4:d.r).toFixed(2)}"
    fill="${ink}" fill-opacity="${hl?1:0.32}" stroke="${hl?cssv('--bg'):'none'}" stroke-width="${hl?0.5:0}"/>`;
}

function Players(){
  const root=h('<div></div>');
  const cmp = state.pMode==='compare', scat = state.pMode==='scatter';
  const head={compare:['Head to head','Put any two players on the same percentile axes. Both profiles are drawn from per-90 output ranked against positional peers.'],
    scatter:['Two metrics at once','Plot any metric against any other. Each dot is a player; the crosshair marks the median of the field shown. Click a dot for their full profile.'],
    table:['Every player, every metric','Sortable per-90 output for all players with enough minutes. Filter by position, then click any player for a percentile profile against their positional peers.']}[state.pMode];
  root.append(h(`<div style="margin:26px 2px 6px">
    <div class="eyebrow">Player database</div>
    <h2 style="font-size:26px;letter-spacing:-.02em;margin-top:6px">${head[0]}</h2>
    <p class="ink2" style="max-width:680px;margin:8px 0 0">${head[1]}</p></div>`));

  const modeSeg=h(`<div class="subtabs" style="margin:14px 0 2px"></div>`);
  [['table','Table'],['scatter','Scatter'],['compare','Compare']].forEach(([k,l])=>{
    const b=h(`<button class="${state.pMode===k?'on':''}">${l}</button>`);
    b.onclick=()=>{state.pMode=k; render();}; modeSeg.append(b);});
  root.append(modeSeg);

  if(cmp){ root.append(comparePanel()); return root; }
  if(scat){ root.append(scatterPanel()); return root; }

  if(state.pPlayer){ const P=AGG.players.find(p=>p.id===state.pPlayer); if(P) root.append(playerDetail(P)); }

  // controls
  const bar=h(`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:16px 0 12px"></div>`);
  const posSeg=h(`<div class="seg"></div>`);
  [['all','All'],['GK','GK'],['DEF','DEF'],['MID','MID'],['FWD','FWD']].forEach(([k,l])=>{
    const b=h(`<button class="${state.pPos===k?'on neu':''}">${l}</button>`);
    b.onclick=()=>{state.pPos=k; render();}; posSeg.append(b);});
  bar.append(posSeg);
  const p90Seg=h(`<div class="seg"></div>`);
  [['per90','Per 90',true],['tot','Totals',false]].forEach(([k,l,v])=>{
    const b=h(`<button class="${state.pPer90===v?'on neu':''}">${l}</button>`);
    b.onclick=()=>{state.pPer90=v; render();}; p90Seg.append(b);});
  bar.append(p90Seg);
  const minSel=h(`<select style="font:inherit;font-weight:600;padding:7px 10px;border-radius:9px;border:1px solid var(--border);background:var(--surface-1);color:var(--ink);cursor:pointer"></select>`);
  [[90,'≥ 90 min'],[180,'≥ 180 min'],[270,'≥ 270 min'],[450,'≥ 450 min']].forEach(([v,l])=>
    minSel.append(h(`<option value="${v}" ${state.pMin===v?'selected':''}>${l}</option>`)));
  minSel.onchange=()=>{state.pMin=+minSel.value; render();}; bar.append(minSel);
  const search=h(`<input placeholder="Search player / team" value="${esc(state.pSearch)}" style="font:inherit;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--surface-1);color:var(--ink);flex:1;min-width:160px">`);
  search.oninput=()=>{state.pSearch=search.value; const b=$('#pbody'); if(b) b.replaceWith(pBody());};
  bar.append(search);
  root.append(bar);

  const box=h(`<div class="card pad" style="overflow-x:auto"></div>`);
  const t=h(`<table></table>`);
  const thead=h(`<thead><tr></tr></thead>`); const tr=$('tr',thead);
  const nameTh=h(`<th class="${state.pSort.key==='name'?'sorted':''}">Player${state.pSort.key==='name'?(state.pSort.dir<0?' ▾':' ▴'):''}</th>`);
  nameTh.onclick=()=>psort('name'); tr.append(nameTh);
  tr.append(h(`<th style="text-align:left">Team</th>`));
  PCOLS.forEach(c=>{const th=h(`<th class="${state.pSort.key===c.k?'sorted':''}">${c.l}${state.pSort.key===c.k?(state.pSort.dir<0?' ▾':' ▴'):''}</th>`);
    th.onclick=()=>psort(c.k); tr.append(th);});
  t.append(thead); t.append(pBody()); box.append(t); root.append(box);
  root.append(h(`<div class="footnote">Per-90 values need a minutes floor to be meaningful — hence the filter. Tkl+Int = tackles plus interceptions. A player's pizza chart always ranks them against same-position players with ≥${PEER_MIN} minutes, independent of the filter above.</div>`));
  return root;
}
function psort(k){ if(state.pSort.key===k) state.pSort.dir*=-1; else state.pSort={key:k,dir:k==='name'||k==='group'?1:-1}; render(); }
function pFilteredSorted(){
  const q=state.pSearch.trim().toLowerCase();
  let rows=AGG.players.filter(p=>p.min>=state.pMin && (state.pPos==='all'||p.group===state.pPos));
  if(q) rows=rows.filter(p=>p.name.toLowerCase().includes(q)||p.team.toLowerCase().includes(q));
  const k=state.pSort.key, d=state.pSort.dir;
  const col=PCOLS.find(c=>c.k===k);
  rows.sort((a,b)=>{
    if(k==='name') return a.name.localeCompare(b.name)*d;
    if(k==='group') return (POS_ORDER[a.group]-POS_ORDER[b.group])*d || a.name.localeCompare(b.name);
    const av=col?(col.t==='tot'?a.min:col.t==='pct'?a._passpct:pVal(a,col)):a[k];
    const bv=col?(col.t==='tot'?b.min:col.t==='pct'?b._passpct:pVal(b,col)):b[k];
    return (av-bv)*d || a.name.localeCompare(b.name);
  });
  return rows;
}
function pBody(){
  const rows=pFilteredSorted();
  const tb=h(`<tbody id="pbody"></tbody>`);
  rows.slice(0,300).forEach(p=>{
    const tr=h(`<tr style="cursor:pointer"><td class="name">${esc(p.name)}</td>
      <td style="text-align:left">${teamBadge(p.code)}<span class="muted">${p.mp}′apps</span></td>
      ${PCOLS.map(c=>`<td class="tnum">${pFmt(p,c)}</td>`).join('')}</tr>`);
    tr.onclick=()=>{state.pPlayer=p.id; render(); scrollTo(0,0);}; tb.append(tr);
  });
  if(!rows.length) tb.append(h(`<tr><td colspan="${PCOLS.length+2}" class="muted" style="padding:20px;text-align:center">no players match</td></tr>`));
  return tb;
}

/* ---------------- player percentile profile: pizza chart + summary ------- */
const PEER_MIN=180;                       // stable peer floor (~2 full matches)
// three categories, three monochrome fills: solid ink / hatched / light ink
const CAT={att:{l:'Attacking',v:'--cat-att',css:'var(--fg)'},
           pos:{l:'Passing',  v:'--cat-pos',css:HATCH_CSS,hatch:true},
           def:{l:'Defending',v:'--cat-def',css:'var(--fg-2)'}};
// outfield set (12 slices) — grouped so each category forms a contiguous arc
const PIZZA_OUT=[
  {k:'goals',l:'Goals',g:'att'},{k:'npxg',l:'npxG',g:'att',dec:2},{k:'xa',l:'xA',g:'att',dec:2},
  {k:'shots',l:'Shots',g:'att'},{k:'dribbles',l:'Dribbles',g:'att'},
  {k:'passes',l:'Passes',g:'pos',dec:0},{k:'_passpct',l:'Pass %',g:'pos',pct:true},
  {k:'prog',l:'Prog. passes',g:'pos'},{k:'xt',l:'xT created',g:'pos',dec:2},
  {k:'xtp',l:'xT prevented',g:'def',dec:2},
  {k:'tackles',l:'Tackles',g:'def'},{k:'intercept',l:'Interceptions',g:'def'},
  {k:'recov',l:'Recoveries',g:'def'},{k:'clear',l:'Clearances',g:'def'},
  {k:'aerials',l:'Aerials won',g:'def'},
];
const PIZZA_GK=[
  {k:'saves',l:'Saves',g:'def'},{k:'xtp',l:'xT prevented',g:'def',dec:2},
  {k:'clear',l:'Clearances',g:'def'},
  {k:'recov',l:'Recoveries',g:'def'},{k:'aerials',l:'Aerials won',g:'def'},
  {k:'passes',l:'Passes',g:'pos',dec:0},{k:'_passpct',l:'Pass %',g:'pos',pct:true},
  {k:'prog',l:'Prog. passes',g:'pos'},
];
const mVal=(p,m)=> m.pct ? p._passpct : per90(p[m.k],p.min);
const mFmt=(v,m)=>{ const d=m.dec!=null?m.dec:1;
  return m.pct ? v.toFixed(0)+'%' : (+v.toFixed(d)).toFixed(d); };   // avoid "-0.00"
function pcOf(P,m,peers){
  const v=mVal(P,m); const arr=peers.map(x=>mVal(x,m)).sort((a,b)=>a-b);
  let worse=0; arr.forEach(x=>{if(x<v)worse++;});
  return {v, pc: arr.length>1?Math.round(100*worse/(arr.length-1)):50};
}

/* radial pizza: one wedge per metric, radius ∝ percentile, colour by category */
function pizzaChart(P,peers,metrics){
  const cx=60,cy=58,R=34,N=metrics.length;
  const hpid='pz'+(++_hid);                  // hatch pattern for the Passing category
  const A=i=>(-90+i*360/N)*Math.PI/180;      // wedge start angle
  const pol=(r,a)=>[cx+r*Math.cos(a), cy+r*Math.sin(a)];
  const arc=(r0,r1,a0,a1)=>{
    const [x0,y0]=pol(r1,a0),[x1,y1]=pol(r1,a1),[x2,y2]=pol(r0,a1),[x3,y3]=pol(r0,a0);
    const lg=(a1-a0)>Math.PI?1:0;
    return `M ${x0} ${y0} A ${r1} ${r1} 0 ${lg} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${lg} 0 ${x3} ${y3} Z`;
  };
  const gap=0.012;                           // small radial gap between slices
  let track='',wedge='',labels='',rings='';
  [25,50,75,100].forEach(f=>{rings+=`<circle cx="${cx}" cy="${cy}" r="${R*f/100}" fill="none"
    stroke="${cssv('--grid')}" stroke-width="${f===50?'.45':'.3'}" ${f===50?'stroke-dasharray="1.2 1.2"':''}/>`;});
  metrics.forEach((m,i)=>{
    const a0=A(i)+gap, a1=A(i+1)-gap;
    const {v,pc}=pcOf(P,m,peers);
    const cat=CAT[m.g];
    const ink = m.g==='def' ? cssv('--fg-2') : cssv('--fg');   // solid colour for strokes/text
    const col = cat.hatch ? `url(#${hpid})` : ink;             // wedge fill (may be a pattern)
    track +=`<path d="${arc(0,R,a0,a1)}" fill="${cssv('--grid')}" fill-opacity=".55"/>`;
    wedge +=`<path d="${arc(0,R*pc/100,a0,a1)}" fill="${col}" fill-opacity=".9" stroke="${ink}" stroke-width=".25"/>`;
    const am=(a0+a1)/2;
    // percentile inside the wedge only when there's room; otherwise it goes in the label
    if(pc>=18){
      const [px,py]=pol(R*pc/100-4.5,am);
      wedge +=`<text x="${px}" y="${py+1.2}" font-size="3.2" font-weight="800" text-anchor="middle"
         fill="var(--bg)" style="paint-order:stroke" stroke="${ink}" stroke-width="1.6">${pc}</text>`;
    }
    // outside label + raw per-90 value (low percentiles carry their rank here)
    const [lx,ly]=pol(R+6,am);
    const c=Math.cos(am), anchor=Math.abs(c)<0.25?'middle':(c>0?'start':'end');
    const sub = pc>=18 ? mFmt(v,m) : `${mFmt(v,m)} · ${pc}pc`;
    labels+=`<text x="${lx}" y="${ly}" font-size="3.1" font-weight="700" text-anchor="${anchor}" fill="${cssv('--ink-2')}">${esc(m.l)}</text>
      <text x="${lx}" y="${ly+3.7}" font-size="2.8" text-anchor="${anchor}" fill="${cssv('--muted')}">${sub}</text>`;
  });
  const defs=`<defs>${hatchPattern(hpid,cssv('--fg'),0)}</defs>`;
  return svgEl(`-18 -4 156 122`, defs+rings+track+wedge+labels, 'style="overflow:visible"');
}

/* ---- pass sonar: every pass a player made, binned by direction ---- */
function playerPasses(P){
  const out=[];
  M.forEach(m=>['home','away'].forEach(s=>{
    const arr=m.players[s]; if(!arr) return;
    let idx=-1; for(let i=0;i<arr.length;i++) if(arr[i].id===P.id){idx=i;break;}
    if(idx<0) return;
    const a=(m.passes&&m.passes[s])||[];
    for(let i=0;i<a.length;i+=6)
      if(a[i]===idx) out.push({x:a[i+1],y:a[i+2],ex:a[i+3],ey:a[i+4],f:a[i+5]});
  }));
  return out;
}
function passSonar(P){
  const ps=playerPasses(P), NB=16, TAU=Math.PI*2;
  const bins=Array.from({length:NB},()=>({n:0,ok:0,d:0}));
  ps.forEach(p=>{
    // negate dy for the same reason PY does: increasing provider y is toward the
    // attacker's LEFT, which must plot upward so the sonar matches the pitch
    const dx=(p.ex-p.x)*1.05, dy=-(p.ey-p.y)*0.68;   // pitch units -> metres
    const dist=Math.hypot(dx,dy); if(dist<1) return;
    let a=Math.atan2(dy,dx); if(a<0)a+=TAU;
    const b=Math.floor(a/TAU*NB)%NB;
    bins[b].n++; bins[b].d+=dist; if(p.f&1)bins[b].ok++;
  });
  const avg=bins.map(b=>b.n?b.d/b.n:0);
  const maxD=Math.max(...avg,1), maxN=Math.max(...bins.map(b=>b.n),1);
  const cx=50,cy=50,R=33, col=cssv('--cat-pos');
  const pol=(r,a)=>[cx+r*Math.cos(a), cy+r*Math.sin(a)];
  const arc=(r0,r1,a0,a1)=>{
    const [x0,y0]=pol(r1,a0),[x1,y1]=pol(r1,a1),[x2,y2]=pol(r0,a1),[x3,y3]=pol(r0,a0);
    return `M ${x0} ${y0} A ${r1} ${r1} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 0 0 ${x3} ${y3} Z`;
  };
  let rings='',wedges='';
  [10,20,30].forEach(d=>{ if(d<=maxD*1.05){ const r=R*d/maxD;
    rings+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cssv('--grid')}" stroke-width=".3" stroke-dasharray="1.2 1.2"/>
      <text x="${cx+1}" y="${cy-r+2.6}" font-size="2.4" fill="${cssv('--muted')}">${d}m</text>`; }});
  bins.forEach((b,i)=>{
    if(!b.n) return;
    const a0=i/NB*TAU+0.012, a1=(i+1)/NB*TAU-0.012;
    const r=R*avg[i]/maxD, op=0.20+0.75*(b.n/maxN);
    wedges+=`<path d="${arc(0,r,a0,a1)}" fill="${col}" fill-opacity="${op.toFixed(3)}" stroke="${cssv('--surface-1')}" stroke-width=".25"/>`;
  });
  const axes=`<line x1="${cx-R-5}" y1="${cy}" x2="${cx+R+5}" y2="${cy}" stroke="${cssv('--grid')}" stroke-width=".3"/>
    <line x1="${cx}" y1="${cy-R-5}" x2="${cx}" y2="${cy+R+5}" stroke="${cssv('--grid')}" stroke-width=".3"/>
    <text x="${cx+R+7}" y="${cy+1}" font-size="3" font-weight="700" fill="${cssv('--ink-2')}">forward</text>
    <text x="${cx-R-7}" y="${cy+1}" font-size="3" text-anchor="end" fill="${cssv('--muted')}">back</text>
    <text x="${cx}" y="${cy-R-7}" font-size="2.8" text-anchor="middle" fill="${cssv('--muted')}">left</text>
    <text x="${cx}" y="${cy+R+9}" font-size="2.8" text-anchor="middle" fill="${cssv('--muted')}">right</text>`;
  const el=svgEl(`-16 -12 132 124`, rings+wedges+axes, 'style="overflow:visible"');
  const box=h(`<div></div>`); box.append(el);
  const fwd=bins.slice(0,4).concat(bins.slice(12)).reduce((a,b)=>a+b.n,0);
  box.append(h(`<div class="footnote">${ps.length} passes · wedge length = average distance in that
    direction, shading = volume · ${Math.round(100*fwd/Math.max(ps.length,1))}% played forward.</div>`));
  return box;
}

function playerDetail(P){
  const metrics = P.group==='GK'?PIZZA_GK:PIZZA_OUT;
  const peers=AGG.players.filter(x=>x.group===P.group && x.min>=PEER_MIN);
  const scored=metrics.map(m=>({m,...pcOf(P,m,peers)}));
  const wrap=h(`<div class="card pad" style="margin-top:6px;position:relative"></div>`);
  const close=h(`<button class="icon-btn" style="position:absolute;top:12px;right:12px;z-index:2">✕</button>`);
  close.onclick=()=>{state.pPlayer=null; render();}; wrap.append(close);
  const cmpBtn=h(`<button class="chip" style="position:absolute;top:13px;right:52px;z-index:2;cursor:pointer">Compare ⇄</button>`);
  cmpBtn.onclick=()=>{ // carry this player into the head-to-head as A, keep B if it isn't them
    state.pcA=P.id; if(state.pcB===P.id) state.pcB='';
    state.pMode='compare'; render(); scrollTo(0,0);};
  wrap.append(cmpBtn);
  wrap.append(h(`<div style="display:flex;align-items:center;gap:12px">${teamBadge(P.code)}
    <div><div style="font-size:19px;font-weight:750">${esc(P.name)}</div>
    <div class="muted" style="font-size:12px">${esc(P.team)} · ${P.group} · ${P.mp} apps · ${Math.round(P.min)} min played</div></div></div>`));
  wrap.append(h(`<div class="footnote" style="margin:6px 0 0">Percentile rank on per-90 output vs
    <b>${peers.length}</b> ${P.group==='GK'?'goalkeepers':P.group.toLowerCase()+'s'} with ≥${PEER_MIN} minutes.
    100 = best in the tournament for that metric.</div>`));

  const cols=h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:10px" class="two-col"></div>`);

  // left: pizza + legend
  const left=h(`<div></div>`);
  left.append(pizzaChart(P,peers,metrics));
  const lg=h(`<div class="legend" style="justify-content:center"></div>`);
  Object.entries(CAT).forEach(([k,c])=>{ if(!metrics.some(m=>m.g===k))return;
    lg.append(h(`<span class="it"><span class="dot" style="background:${c.hatch?'none':c.css};${c.hatch?'background-image:'+HATCH_CSS+';border:1px solid var(--fg)':''}"></span>${c.l}</span>`));});
  left.append(lg);
  left.append(h(`<div class="eyebrow" style="margin:18px 0 4px">Pass sonar
    <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· direction &amp; length of every pass</span></div>`));
  left.append(passSonar(P));
  cols.append(left);

  // right: category averages + strengths / weaknesses
  const right=h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  const catBox=h(`<div></div>`);
  catBox.append(h(`<div class="eyebrow" style="margin-bottom:9px">Category strength</div>`));
  Object.entries(CAT).forEach(([k,c])=>{
    const set=scored.filter(s=>s.m.g===k); if(!set.length)return;
    const avg=Math.round(set.reduce((a,s)=>a+s.pc,0)/set.length);
    catBox.append(h(`<div style="display:grid;grid-template-columns:74px 1fr 30px;gap:10px;align-items:center;padding:3px 0">
      <span style="font-size:12px;font-weight:650">${c.l}</span>
      <span style="height:9px;border-radius:5px;background:var(--grid);position:relative">
        <i style="position:absolute;left:0;top:0;height:100%;width:${avg}%;background:${c.hatch?'none':c.css};${c.hatch?'background-image:'+HATCH_CSS+';border:1px solid var(--fg)':''}"></i></span>
      <span class="tnum" style="font-size:12px;font-weight:750;text-align:right">${avg}</span></div>`));
  });
  right.append(catBox);
  const strong=scored.filter(s=>s.pc>=80).sort((a,b)=>b.pc-a.pc);
  const weak=scored.filter(s=>s.pc<=20).sort((a,b)=>a.pc-b.pc);
  const chipRow=(title,items,colr)=>{
    const b=h(`<div></div>`);
    b.append(h(`<div class="eyebrow" style="margin-bottom:7px">${title}</div>`));
    const cw=h(`<div style="display:flex;flex-wrap:wrap;gap:6px"></div>`);
    if(!items.length) cw.append(h(`<span class="muted" style="font-size:12px">none stand out</span>`));
    items.forEach(s=>cw.append(h(`<span class="chip" style="border-color:transparent;background:${colr};color:var(--bg)">
      ${esc(s.m.l)} <b class="tnum">${s.pc}</b></span>`)));
    b.append(cw); return b;
  };
  right.append(chipRow('Elite traits (top 20%)',strong,'var(--good)'));
  right.append(chipRow('Weak spots (bottom 20%)',weak,'var(--fg-3)'));

  // detailed percentile table, grouped by category (sits beside the pizza)
  right.append(h(`<div class="eyebrow" style="margin-top:2px">Detailed percentile summary</div>`));
  const tbl=h(`<div style="display:grid;gap:2px"></div>`);
  Object.entries(CAT).forEach(([k,c])=>{
    const set=scored.filter(s=>s.m.g===k); if(!set.length)return;
    tbl.append(h(`<div style="display:flex;align-items:center;gap:7px;margin:8px 0 2px">
      <span class="dot" style="background:${c.hatch?'none':c.css};${c.hatch?'background-image:'+HATCH_CSS+';border:1px solid var(--fg)':''}"></span>
      <span style="font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">${c.l}</span></div>`));
    set.forEach(s=>{
      const col='var(--fg)';
      tbl.append(h(`<div style="display:grid;grid-template-columns:130px 64px 1fr 40px;gap:10px;align-items:center;padding:4px 0;border-bottom:1px solid var(--grid)">
        <span style="font-size:12px;font-weight:600">${esc(s.m.l)}</span>
        <span class="tnum" style="font-size:12px;text-align:right;color:var(--ink-2)">${mFmt(s.v,s.m)}</span>
        <span style="height:8px;border-radius:4px;background:var(--grid);position:relative">
          <i style="position:absolute;left:0;top:0;height:100%;width:${s.pc}%;background:${col};border-radius:4px"></i></span>
        <span class="tnum" style="font-size:12px;font-weight:750;text-align:right;color:${col}">${s.pc}</span></div>`));
    });
  });
  right.append(tbl);
  right.append(h(`<div class="footnote" style="margin-top:2px">Middle column is the raw per-90 value; bar and number are the percentile.
    Pass % is a rate, not a per-90 count.</div>`));
  cols.append(right); wrap.append(cols);
  return wrap;
}

/* ============================ player comparison: overlaid radar ========= */
/* Two players on one set of percentile axes. Monochrome, so the two series are
   separated by line style and dot fill, never by hue:
     A = solid stroke, flat fill, solid dots
     B = dashed stroke, hatched fill, hollow dots                           */
/* Selectable in the head-to-head. This floor is deliberately LOWER than PEER_MIN:
   a profile is reachable from the table at ≥90 minutes, so the Compare button on that
   profile has to be able to open the same player. Peers stay at PEER_MIN either way —
   you can rank a 100-minute player against the ≥180 pool, you just can't put him in it. */
const CMP_MIN=90;
function cmpEligible(){
  return AGG.players.filter(p=>p.min>=CMP_MIN).sort((a,b)=>a.name.localeCompare(b.name));
}
function cmpDefaults(){
  const out=AGG.players.filter(p=>p.group!=='GK' && p.min>=PEER_MIN).sort((a,b)=>b.goals-a.goals||b.min-a.min);
  return [out[0]&&out[0].id, out[1]&&out[1].id];
}
function cmpPeers(P){ return AGG.players.filter(x=>x.group===P.group && x.min>=PEER_MIN); }

/* Generic overlaid percentile radar, shared by the player and team head-to-heads.
   `items` = [{l: axis label, sub: small text under it, a: 0-100, b: 0-100}].
   A carries the fill, B is outline-only. Hatching B as well turns the overlap into
   mud — with one filled and one drawn, whichever sits on top still reads. */
function overlayRadar(items){
  const cx=50,cy=50,R=33,N=items.length, ink=cssv('--fg');
  const pt=(i,r)=>{const a=(-90+i*360/N)*Math.PI/180; return [cx+r*Math.cos(a), cy+r*Math.sin(a)];};
  let rings='',axes='',labels='';
  [.25,.5,.75,1].forEach(f=>{
    const pts=items.map((_,i)=>pt(i,R*f).map(v=>v.toFixed(1)).join(',')).join(' ');
    rings+=`<polygon points="${pts}" fill="none" stroke="${cssv('--grid')}" stroke-width="${f===.5?'.4':'.25'}" ${f===.5?'stroke-dasharray="1 1"':''}/>`;
  });
  items.forEach((m,i)=>{
    const [ex,ey]=pt(i,R);
    axes+=`<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${cssv('--grid')}" stroke-width=".25"/>`;
    const [lx,ly]=pt(i,R+7.5);
    const c=Math.cos((-90+i*360/N)*Math.PI/180);
    const anchor=Math.abs(c)<0.25?'middle':(c>0?'start':'end');
    labels+=`<text x="${lx}" y="${ly}" font-size="2.9" font-weight="700" text-anchor="${anchor}" fill="${cssv('--ink-2')}">${esc(m.l)}</text>
      <text x="${lx}" y="${ly+3.4}" font-size="2.6" text-anchor="${anchor}" fill="${cssv('--muted')}" class="tnum">${esc(m.sub)}</text>`;
  });
  const poly=key=>items.map((m,i)=>pt(i,R*m[key]/100).map(v=>v.toFixed(1)).join(',')).join(' ');
  const dots=(key,solid)=>items.map((m,i)=>{const[px,py]=pt(i,R*m[key]/100);
    return `<circle cx="${px}" cy="${py}" r="${solid?1:1.1}" fill="${solid?ink:cssv('--bg')}" stroke="${ink}" stroke-width="${solid?0:.55}"/>`;}).join('');
  const shapes=
    `<polygon points="${poly('a')}" fill="${ink}" fill-opacity=".13" stroke="${ink}" stroke-width=".85" stroke-linejoin="round"/>
     <polygon points="${poly('b')}" fill="none" stroke="${ink}" stroke-width=".95" stroke-dasharray="2.2 1.5" stroke-linejoin="round"/>
     ${dots('a',true)}${dots('b',false)}`;
  return svgEl(`-16 -8 132 116`, rings+axes+shapes+labels, 'style="overflow:visible"');
}
/* one ledger row: two bars growing outward from a shared centre label.
   `lead` is -1 if A leads, +1 if B leads, 0 if level. */
function cmpRow(label,aTxt,bTxt,aPc,bPc,lead){
  return h(`<div class="lg-row">
    <span class="tnum lg-v ${lead<0?'lead':''}">${esc(aTxt)}</span>
    <span class="lg-track"><i class="lg-fill a" style="width:${aPc}%"></i></span>
    <span class="lg-lbl">${esc(label)}</span>
    <span class="lg-track"><i class="lg-fill b" style="width:${bPc}%"></i></span>
    <span class="tnum lg-v ${lead>0?'lead':''}">${esc(bTxt)}</span></div>`);
}
function compareRadar(A,B,metrics,peersA,peersB){
  return overlayRadar(metrics.map(m=>{
    const a=pcOf(A,m,peersA), b=pcOf(B,m,peersB);
    return {l:m.l, sub:`${a.pc} · ${b.pc}`, a:a.pc, b:b.pc};
  }));
}

function comparePanel(){
  const wrap=h(`<div></div>`);
  const elig=cmpEligible();
  if(elig.length<2) return h(`<div class="card pad muted">Not enough players clear the ${PEER_MIN}-minute floor to compare.</div>`);
  const byId=id=>elig.find(p=>p.id===id);
  let A=byId(state.pcA), B=byId(state.pcB);
  if(!A||!B){ const [a,b]=cmpDefaults(); A=A||byId(a)||elig[0]; B=B||byId(b)||elig[1]; }
  // same guard as the team panel: a deep-link can name one player on both sides
  if(A.id===B.id) B=elig.find(p=>p.id!==A.id);
  state.pcA=A.id; state.pcB=B.id;

  // ---- pickers
  const bar=h(`<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:16px 0 14px" class="lg-bar"></div>`);
  const mkSel=(cur,other,set)=>{
    const s=h(`<select class="lg-sel"></select>`);
    elig.forEach(p=>{ if(p.id===other) return;
      s.append(h(`<option value="${esc(p.id)}" ${p.id===cur?'selected':''}>${esc(p.name)} — ${esc(p.team)} (${p.group})</option>`));});
    s.onchange=()=>{set(s.value); render();};
    return s;
  };
  bar.append(mkSel(A.id,B.id,v=>state.pcA=v));
  const swap=h(`<button class="icon-btn" title="Swap players" aria-label="Swap players">⇄</button>`);
  swap.onclick=()=>{const t=state.pcA; state.pcA=state.pcB; state.pcB=t; render();};
  bar.append(swap);
  bar.append(mkSel(B.id,A.id,v=>state.pcB=v));
  wrap.append(bar);

  const metrics = (A.group==='GK'&&B.group==='GK') ? PIZZA_GK : PIZZA_OUT;
  const peersA=cmpPeers(A), peersB=cmpPeers(B);
  const mixed = A.group!==B.group;
  const thin = [A,B].filter(p=>p.min<PEER_MIN);   // below the peer floor: per-90 is noisy

  const card=h(`<div class="card pad"></div>`);
  // ---- heads
  const heads=h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" class="two-col"></div>`);
  [[A,'solid'],[B,'dash']].forEach(([P,style])=>{
    heads.append(h(`<div style="display:flex;align-items:center;gap:10px">
      <span class="lg-key ${style}"></span>${teamBadge(P.code)}
      <div style="min-width:0"><div style="font-size:16px;font-weight:750">${esc(P.name)}</div>
      <div class="muted" style="font-size:11.5px">${esc(P.team)} · ${P.group} · ${P.mp} apps · ${Math.round(P.min)} min</div></div></div>`));
  });
  card.append(heads);

  const cols=h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px" class="two-col"></div>`);
  const left=h(`<div></div>`);
  left.append(compareRadar(A,B,metrics,peersA,peersB));
  left.append(h(`<div class="legend" style="justify-content:center;margin-top:2px">
    <span class="it"><span class="lg-key solid"></span>${esc(A.name)}</span>
    <span class="it"><span class="lg-key dash"></span>${esc(B.name)}</span></div>`));
  left.append(h(`<div class="footnote">Each spoke is a percentile rank on per-90 output; the outer ring is 100.
    Numbers under each label are <b>${esc(A.name.split(' ').pop())} · ${esc(B.name.split(' ').pop())}</b>.
    ${mixed?`They play different positions, so each is ranked against <b>their own</b> positional peers —
      the shapes are comparable as profiles, not as like-for-like output.`
     :`Both are ranked against the same ${peersA.length} ${A.group==='GK'?'goalkeepers':A.group.toLowerCase()+'s'} with ≥${PEER_MIN} minutes.`}
    ${thin.length?`<b>${thin.map(p=>esc(p.name)).join(' and ')}</b>
      ${thin.length>1?'have':'has'} under ${PEER_MIN} minutes, so ${thin.length>1?'their':'its'} per-90 rates
      sit on a small sample and will swing on a single action.`:''}</div>`));
  cols.append(left);

  // ---- per-metric ledger: raw values, percentiles, and who leads
  const right=h(`<div></div>`);
  right.append(h(`<div class="eyebrow" style="margin-bottom:8px">Metric by metric</div>`));
  const tbl=h(`<div style="display:grid;gap:2px"></div>`);
  let winA=0,winB=0;
  Object.entries(CAT).forEach(([k,c])=>{
    const set=metrics.filter(m=>m.g===k); if(!set.length)return;
    tbl.append(h(`<div style="display:flex;align-items:center;gap:7px;margin:9px 0 3px">
      <span class="dot" style="background:${c.hatch?'none':c.css};${c.hatch?'background-image:'+HATCH_CSS+';border:1px solid var(--fg)':''}"></span>
      <span style="font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">${c.l}</span></div>`));
    set.forEach(m=>{
      const a=pcOf(A,m,peersA), b=pcOf(B,m,peersB);
      const lead = a.pc===b.pc ? 0 : (a.pc>b.pc?-1:1);
      if(lead<0)winA++; else if(lead>0)winB++;
      tbl.append(cmpRow(m.l, mFmt(a.v,m), mFmt(b.v,m), a.pc, b.pc, lead));
    });
  });
  right.append(tbl);
  right.append(h(`<div class="lg-tally"><b class="tnum">${winA}</b> ${esc(A.name)}
    &nbsp;·&nbsp; <b class="tnum">${winB}</b> ${esc(B.name)}
    <span class="muted"> — metrics led on percentile, of ${metrics.length}</span></div>`));
  right.append(h(`<div class="footnote">Outer number is the raw per-90 value, the bar is the percentile.
    Bars grow outward from the metric name. Leading value is emphasised.
    ${mixed?`Because they are ranked against different positional peers, the higher percentile is
      <b>not</b> always the higher raw number — read the outer figures for like-for-like output.`:''}</div>`));
  cols.append(right);
  card.append(cols); wrap.append(card);
  return wrap;
}

/* ============================================================ shared ==== */
function fmtDate(d){const [y,mo,da]=d.split('-');
  const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${+da} ${mn[+mo-1]}`;}

function attachShotTT(elWrap){
  const svg=$('svg',elWrap);
  svg.addEventListener('mousemove',e=>{
    const t=e.target;
    if(t.classList&&t.classList.contains('shot')&&t.dataset.tt){
      const [a,b,c]=t.dataset.tt.split('||');
      TT.innerHTML=`<div class="tt-h">${a}</div><div class="tt-r">${b||''}</div><div class="tt-r">${c||''}</div>`;
      TT.style.opacity=1; TT.style.left=Math.min(e.clientX+14,innerWidth-240)+'px'; TT.style.top=(e.clientY+14)+'px';
    } else {TT.style.opacity=0;}
  });
  svg.addEventListener('mouseleave',()=>TT.style.opacity=0);
}

/* boot — optional deep-link via hash (#view=match&mi=6&tab=shots&theme=dark) */
(function(){
  const p=new URLSearchParams(location.hash.slice(1));
  if(p.get('view')) state.view=p.get('view');
  // the hash is untrusted — a stale or hand-edited link must not blank the page.
  // Unknown ids elsewhere already fall back gracefully; a bad match index did not.
  if(p.get('mi')!=null && p.get('mi')!==''){
    const i=+p.get('mi');
    if(Number.isFinite(i)) state.mi=Math.min(Math.max(Math.trunc(i),0), M.length-1);
  }
  if(p.get('tab') && MATCH_TAB_KEYS.includes(p.get('tab'))) state.tab=p.get('tab');
  // `net` indexes straight into m.heat / m.netPos / m[side] — anything but home|away
  // blanks the Heatmap, Pass network and Zones tabs
  if(p.get('net')==='home'||p.get('net')==='away') state.net=p.get('net');
  if(p.get('lb')) state.lb=p.get('lb');
  if(p.get('team')) state.team=p.get('team');
  if(p.get('pp')) state.pPlayer=p.get('pp');
  if(p.get('pf')) state.pf=p.get('pf');
  if(p.get('hp')) state.hPlayer=p.get('hp');
  if(p.get('tmap')) state.tmap=p.get('tmap');
  if(p.get('pmode')) state.pMode=p.get('pmode');
  if(p.get('pxk')) state.pxk=p.get('pxk');
  if(p.get('pyk')) state.pyk=p.get('pyk');
  if(p.get('tmode')) state.tMode=p.get('tmode');
  if(p.get('tca')) state.tcA=p.get('tca');
  if(p.get('tcb')) state.tcB=p.get('tcb');
  if(p.get('tcmap')) state.tcmap=p.get('tcmap');
  if(p.get('tradar')) state.tRadar=p.get('tradar');
  if(p.get('pca')) state.pcA=p.get('pca');
  if(p.get('pcb')) state.pcB=p.get('pcb');
  if(p.get('theme')) document.documentElement.setAttribute('data-theme',p.get('theme'));
  document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('on',x.dataset.view===state.view));
})();
render();
