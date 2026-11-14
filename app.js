(()=>{
"use strict";
const $=s=>document.querySelector(s);
const KEYS={settings:"is-settings-v3",history:"is-history-v3"};
const ENGINES=["google","naver","namu","chatgpt"];
const defaults={theme:"light",engine:"google",newTab:false,autocomplete:true,remoteAutocomplete:true,historySuggestions:true,suggestionCount:8,colors:{accent:"#315fd3",background:"#f7f8fa",surface:"#ffffff"}};
const endpoints={
 google:q=>"https://www.google.com/search?q="+encodeURIComponent(q),
 naver:q=>"https://search.naver.com/search.naver?query="+encodeURIComponent(q),
 namu:q=>"https://namu.wiki/w/"+encodeURIComponent(q),
 chatgpt:q=>"https://chatgpt.com/?q="+encodeURIComponent(q)
};
const safeRead=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
let settings={...defaults,...safeRead(KEYS.settings,safeRead("is-settings-v2",{}))};
if(!ENGINES.includes(settings.engine))settings.engine="google";
let history=safeRead(KEYS.history,safeRead("is-history-v2",safeRead("is-history",[])));
if(!Array.isArray(history))history=[];
history=history.filter(x=>typeof x==="string"&&x.trim()).slice(0,30);
let activeIndex=-1,currentItems=[],requestNumber=0,debounceTimer=null,requestController=null;
const apiCache=new Map(),query=$("#query"),suggestions=$("#suggestions"),status=$("#autocomplete-status");
const normalize=s=>String(s??"").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
function initials(s){const cho=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];return [...String(s)].map(ch=>{const n=ch.charCodeAt(0)-44032;return n>=0&&n<=11171?cho[Math.floor(n/588)]:ch}).join("")}
function saveSettings(){safeWrite(KEYS.settings,settings)}
function saveHistory(){safeWrite(KEYS.history,history)}
function applyTheme(){
 const chosen=settings.theme==="system"?(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light"):settings.theme;
 document.documentElement.dataset.theme=chosen;
 const colors={...defaults.colors,...(settings.colors||{})};
 const root=document.documentElement;
 root.style.setProperty("--accent",colors.accent);
 root.style.setProperty("--accent-soft",colors.accent+"20");
 root.style.setProperty("--bg",colors.background);
 root.style.setProperty("--panel",colors.surface);
 root.style.setProperty("--panel2",colors.background);
 const meta=$('meta[name="theme-color"]');if(meta)meta.content=chosen==="dark"?colors.background:colors.background;
}
function setEngine(engine,persist=true){
 settings.engine=ENGINES.includes(engine)?engine:"google";
 $("#engine-select").value=settings.engine;
 $("#default-engine").value=settings.engine;
 if(persist)saveSettings();
}
function renderHistory(){
 const root=$("#history-list");root.replaceChildren();
 if(!history.length){const p=document.createElement("span");p.className="empty-history";p.textContent="아직 검색 기록이 없어요. 첫 검색을 시작해 보세요.";root.append(p);return}
 history.slice(0,12).forEach(term=>{
  const b=document.createElement("button");b.type="button";b.className="history-chip";b.textContent=term;b.title=term;
  b.addEventListener("click",()=>runSearch(term));root.append(b);
 });
}
function localSuggestions(raw){
 const q=normalize(raw.trim());if(!q)return settings.historySuggestions?history.slice(0,settings.suggestionCount).map(term=>({term,type:"최근 검색",reason:"다시 검색",score:-2})): [];
 const found=[],seen=new Set();
 const add=(term,type,score,reason)=>{const key=normalize(term);if(!key||seen.has(key))return;seen.add(key);found.push({term,type,score,reason})};
 if(settings.historySuggestions)history.forEach(term=>{
  const t=normalize(term);
  if(t===q)add(term,"최근 검색",-3,"최근 검색어");
  else if(t.startsWith(q))add(term,"최근 검색",0,"검색어 앞부분");
  else if(t.includes(q))add(term,"최근 검색",5,"검색어 포함");
  else if(initials(term).toLowerCase().startsWith(q))add(term,"최근 검색",7,"초성 일치");
 });
 (window.SEARCH_DATA||[]).forEach(item=>{
  const term=normalize(item.term),aliases=(item.aliases||[]).map(normalize);
  if(term===q)add(item.term,item.category,-1,"정확히 일치");
  else if(term.startsWith(q))add(item.term,item.category,1,"앞부분 일치");
  else if(aliases.some(x=>x===q))add(item.term,item.category,2,"별칭 일치");
  else if(aliases.some(x=>x.startsWith(q)))add(item.term,item.category,3,"별칭으로 찾음");
  else if(term.includes(q))add(item.term,item.category,4,"중간 글자 일치");
  else if(aliases.some(x=>x.includes(q)))add(item.term,item.category,5,"관련어 일치");
  else if(initials(item.term).toLowerCase().startsWith(q))add(item.term,item.category,6,"초성 일치");
  else if(aliases.some(x=>initials(x).toLowerCase().startsWith(q)))add(item.term,item.category,7,"별칭 초성 일치");
 });
 return found.sort((a,b)=>a.score-b.score||a.term.localeCompare(b.term,"ko"));
}
async function fetchWithTimeout(url,signal,timeout=2600){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 const abort=()=>controller.abort();signal?.addEventListener("abort",abort,{once:true});
 try{const response=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});if(!response.ok)throw new Error("HTTP "+response.status);return await response.json()}
 finally{clearTimeout(timer);signal?.removeEventListener("abort",abort)}
}
async function fetchRemoteSuggestions(term,signal){
 const key=normalize(term);if(apiCache.has(key))return apiCache.get(key);
 const encoded=encodeURIComponent(term);
 const googleUrl="https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q="+encoded;
 const ddgUrl="https://duckduckgo.com/ac/?q="+encoded+"&type=list";
 const tasks=[
  fetchWithTimeout(googleUrl,signal).then(data=>(Array.isArray(data?.[1])?data[1]:[]).map(x=>String(x))).catch(()=>[]),
  fetchWithTimeout(ddgUrl,signal).then(data=>Array.isArray(data)?data.map(x=>String(x.phrase||"")).filter(Boolean):[]).catch(()=>[])
 ];
 const [google,ddg]=await Promise.all(tasks);
 const merged=[...google,...ddg].filter((v,i,a)=>v&&a.findIndex(x=>normalize(x)===normalize(v))===i);
 apiCache.set(key,merged);if(apiCache.size>80)apiCache.delete(apiCache.keys().next().value);
 return merged;
}
function mergeSuggestions(local,remote){
 // API 추천어를 먼저 보여 주고, 부족한 경우에만 기기 내 추천어로 보충
 const result=[],seen=new Set();
 remote.forEach((term,index)=>{
  const key=normalize(term);if(!key||seen.has(key))return;
  seen.add(key);result.push({term,type:"실시간 추천",reason:"검색 추천 API",score:index});
 });
 local.forEach(item=>{
  const key=normalize(item.term);if(!key||seen.has(key))return;
  seen.add(key);result.push(item);
 });
 return result.slice(0,settings.suggestionCount);
}
function renderSuggestionList(items,label){
 suggestions.replaceChildren();currentItems=items;activeIndex=-1;
 if(!items.length){hideSuggestions();status.textContent=query.value.trim()?"추천 결과가 없어요. 입력한 검색어 그대로 검색할 수 있어요.":"";return}
 const title=document.createElement("div");title.className="suggestion-heading";title.textContent=label;suggestions.append(title);
 items.forEach((item,index)=>{
  const button=document.createElement("button");button.type="button";button.className="suggestion-item";button.setAttribute("role","option");button.setAttribute("aria-selected","false");
  const symbol=document.createElement("span");symbol.className="suggestion-symbol";symbol.textContent=item.type==="최근 검색"?"◷":item.type==="실시간 추천"?"✦":"⌕";
  const body=document.createElement("span");body.className="suggestion-body";
  const name=document.createElement("span");name.className="suggestion-label";name.textContent=item.term;
  const meta=document.createElement("span");meta.className="suggestion-meta";
  const type=document.createElement("span");type.className="suggestion-type";type.textContent=item.type;
  const reason=document.createElement("span");reason.className="suggestion-reason";reason.textContent=item.reason||"추천";
  meta.append(type,reason);body.append(name,meta);
  const arrow=document.createElement("span");arrow.className="suggestion-arrow";arrow.textContent="↵";
  button.append(symbol,body,arrow);
  button.addEventListener("pointerdown",event=>event.preventDefault());
  button.addEventListener("click",()=>runSearch(item.term));
  suggestions.append(button);
 });
 suggestions.hidden=false;query.setAttribute("aria-expanded","true");status.textContent="";
}
function hideSuggestions(){suggestions.hidden=true;query.setAttribute("aria-expanded","false");activeIndex=-1}
function selectSuggestion(index){
 const buttons=[...suggestions.querySelectorAll(".suggestion-item")];if(!buttons.length)return;
 activeIndex=Math.max(0,Math.min(index,buttons.length-1));
 buttons.forEach((button,i)=>{button.classList.toggle("selected",i===activeIndex);button.setAttribute("aria-selected",String(i===activeIndex))});
 buttons[activeIndex].scrollIntoView({block:"nearest"});
}
function scheduleSuggestions(){
 const term=query.value.trim(),ticket=++requestNumber;
 clearTimeout(debounceTimer);requestController?.abort();requestController=null;
 $("#clear-query").hidden=!query.value;
 if(!settings.autocomplete){hideSuggestions();status.textContent="자동완성이 꺼져 있어요.";return}
 if(!term){const recent=localSuggestions("");renderSuggestionList(recent,"최근 검색어");return}
 const local=localSuggestions(term).slice(0,settings.suggestionCount);
 renderSuggestionList(local,"추천 검색어");
 if(!settings.remoteAutocomplete||term.length<1){status.textContent=local.length?"기기 내 추천어":"실시간 추천을 사용하지 않아요.";return}
 status.textContent="실시간 추천어 불러오는 중…";
 debounceTimer=setTimeout(async()=>{
  const controller=new AbortController();requestController=controller;
  try{
   const remote=await fetchRemoteSuggestions(term,controller.signal);
   if(ticket!==requestNumber||query.value.trim()!==term)return;
   const merged=mergeSuggestions(local,remote);
   renderSuggestionList(merged,remote.length?"실시간 검색어 추천":"기기 내 추천어");
   status.textContent=remote.length?"실시간 추천어 업데이트 완료":"외부 추천 서비스에 연결할 수 없어 저장된 추천어를 표시해요.";
  }catch{
   if(ticket!==requestNumber)return;
   status.textContent="실시간 추천을 불러오지 못했어요. 기본 추천어를 표시합니다.";
  }
 },220);
}
function runSearch(value){
 const term=String(value??"").trim();if(!term){query.focus();return}
 const target=(endpoints[settings.engine]||endpoints.google)(term);
 history=[term,...history.filter(x=>normalize(x)!==normalize(term))].slice(0,30);saveHistory();renderHistory();
 hideSuggestions();status.textContent="";
 if(settings.newTab){const opened=window.open(target,"_blank","noopener,noreferrer");if(!opened)window.location.href=target}
 else window.location.href=target;
}
function syncSettingsForm(){
 $("#default-engine").value=settings.engine;
 $("#new-tab").checked=!!settings.newTab;
 $("#autocomplete").checked=!!settings.autocomplete;
 $("#remote-autocomplete").checked=!!settings.remoteAutocomplete;
 $("#history-suggestions").checked=!!settings.historySuggestions;
 $("#suggestion-count").value=String(settings.suggestionCount);
 const colors={...defaults.colors,...(settings.colors||{})};
 $("#color-accent").value=colors.accent;$("#color-background").value=colors.background;$("#color-surface").value=colors.surface;
 document.querySelectorAll("[data-theme]").forEach(button=>button.classList.toggle("active",button.dataset.theme===settings.theme));
}
function openSettings(){syncSettingsForm();$("#settings-modal").hidden=false;$("#settings-close").focus()}
function closeSettings(){$("#settings-modal").hidden=true;$("#settings-open").focus()}
function readSettingsForm(){
 settings={...settings,engine:$("#default-engine").value,newTab:$("#new-tab").checked,autocomplete:$("#autocomplete").checked,remoteAutocomplete:$("#remote-autocomplete").checked,historySuggestions:$("#history-suggestions").checked,suggestionCount:Number($("#suggestion-count").value)};
 settings.colors={accent:$("#color-accent").value,background:$("#color-background").value,surface:$("#color-surface").value};
 saveSettings();setEngine(settings.engine,false);applyTheme();scheduleSuggestions();return true;
}
$("#engine-select").addEventListener("change",event=>setEngine(event.target.value));
$("#search-form").addEventListener("submit",event=>{event.preventDefault();runSearch(query.value)});
query.addEventListener("input",scheduleSuggestions);
query.addEventListener("focus",()=>{if(!suggestions.hidden||!query.value.trim())scheduleSuggestions()});
$("#clear-query").addEventListener("click",()=>{query.value="";query.focus();scheduleSuggestions()});
query.addEventListener("keydown",event=>{
 if(event.key==="ArrowDown"&&!suggestions.hidden){event.preventDefault();selectSuggestion(activeIndex+1)}
 else if(event.key==="ArrowUp"&&!suggestions.hidden){event.preventDefault();selectSuggestion(activeIndex<0?currentItems.length-1:activeIndex-1)}
 else if(event.key==="Enter"&&activeIndex>=0&&!suggestions.hidden){event.preventDefault();runSearch(currentItems[activeIndex].term)}
 else if(event.key==="Escape")hideSuggestions();
});
document.addEventListener("pointerdown",event=>{if(!event.target.closest(".search-wrap"))hideSuggestions()});
$("#clear-history").addEventListener("click",()=>{if(!history.length)return;if(!window.confirm("최근 검색 기록을 모두 삭제할까요?"))return;history=[];saveHistory();renderHistory();scheduleSuggestions()});
$("#settings-open").addEventListener("click",openSettings);
$("#settings-close").addEventListener("click",closeSettings);
$("#settings-done").addEventListener("click",()=>{readSettingsForm();closeSettings()});
$("#settings-modal").addEventListener("click",event=>{if(event.target===$("#settings-modal"))closeSettings()});
document.querySelectorAll("[data-theme]").forEach(button=>button.addEventListener("click",()=>{settings.theme=button.dataset.theme;applyTheme();document.querySelectorAll("[data-theme]").forEach(x=>x.classList.toggle("active",x===button))}));
["color-accent","color-background","color-surface"].forEach(id=>$("#"+id).addEventListener("input",()=>{
 settings.colors={accent:$("#color-accent").value,background:$("#color-background").value,surface:$("#color-surface").value};
 applyTheme();
}));
$("#reset-settings").addEventListener("click",()=>{settings={...defaults};saveSettings();syncSettingsForm();applyTheme();setEngine(settings.engine,false);scheduleSuggestions()});
$("#reset-colors").addEventListener("click",()=>{settings.colors={...defaults.colors};syncSettingsForm();applyTheme();saveSettings()});
document.querySelector(".help-links").addEventListener("click",event=>{
 const link=event.target.closest("a[data-help-url]");if(!link)return;event.preventDefault();
 const term=query.value.trim();if(!term){query.focus();status.textContent="먼저 검색창에 검색어를 입력해 주세요.";return}
 const target=link.dataset.helpUrl.replace("{query}",encodeURIComponent(term));
 const opened=window.open(target,"_blank","noopener,noreferrer");if(!opened)window.location.href=target;
});
if(window.matchMedia)window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(settings.theme==="system")applyTheme()});
setEngine(settings.engine,false);applyTheme();renderHistory();syncSettingsForm();$("#clear-query").hidden=true;
})();