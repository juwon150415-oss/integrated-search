(()=>{
"use strict";
const $=s=>document.querySelector(s);
const KEYS={settings:"is-settings-v2",history:"is-history-v2"};
const defaults={theme:"dark",engine:"google",newTab:false,autocomplete:true,historySuggestions:true,suggestionCount:6};
const endpoints={google:q=>"https://www.google.com/search?q="+encodeURIComponent(q),naver:q=>"https://search.naver.com/search.naver?query="+encodeURIComponent(q),namu:q=>"https://namu.wiki/w/"+encodeURIComponent(q)};
const safeRead=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}};
let oldEngine=localStorage.getItem("is-engine");
let oldHistory=safeRead("is-history",[]);
let settings={...defaults,...safeRead(KEYS.settings,{})};
if(!localStorage.getItem(KEYS.settings)&&["google","naver","namu"].includes(oldEngine))settings.engine=oldEngine;
let history=safeRead(KEYS.history,oldHistory);if(!Array.isArray(history))history=[];
history=history.filter(x=>typeof x==="string").slice(0,30);
let activeIndex=-1,currentItems=[];
const query=$("#query"),suggestions=$("#suggestions");
const saveSettings=()=>localStorage.setItem(KEYS.settings,JSON.stringify(settings));
function applyTheme(){const theme=settings.theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):settings.theme;document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]').content=theme==="dark"?"#0b1020":"#f4f7fc"}
function setEngine(engine){settings.engine=engine;saveSettings();document.querySelectorAll(".engine").forEach(b=>b.classList.toggle("active",b.dataset.engine===engine))}
function renderHistory(){const root=$("#history-list");root.replaceChildren();if(!history.length){const p=document.createElement("span");p.className="empty-history";p.textContent="아직 검색 기록이 없어요.";root.append(p);return}history.slice(0,12).forEach(term=>{const b=document.createElement("button");b.type="button";b.className="history-chip";b.textContent=term;b.addEventListener("click",()=>runSearch(term));root.append(b)})}
function rankSuggestions(raw){const q=raw.trim().toLocaleLowerCase();if(!q)return settings.historySuggestions?history.slice(0,settings.suggestionCount).map(term=>({term,type:"최근 검색"})):[];const found=[];const seen=new Set();const add=(term,type,score)=>{const key=term.toLocaleLowerCase();if(!seen.has(key)){seen.add(key);found.push({term,type,score})}};
if(settings.historySuggestions)history.forEach(term=>{const t=term.toLocaleLowerCase();if(t.startsWith(q))add(term,"최근 검색",0);else if(t.includes(q))add(term,"최근 검색",2)});
(window.SEARCH_DATA||[]).forEach(item=>{const term=item.term.toLocaleLowerCase();const aliases=(item.aliases||[]).map(x=>x.toLocaleLowerCase());if(term.startsWith(q))add(item.term,item.category,1);else if(aliases.some(x=>x===q))add(item.term,item.category,2);else if(term.includes(q)||aliases.some(x=>x.includes(q)))add(item.term,item.category,3)});
return found.sort((a,b)=>a.score-b.score).slice(0,settings.suggestionCount)}
function renderSuggestions(){if(!settings.autocomplete){hideSuggestions();return}const items=rankSuggestions(query.value);suggestions.replaceChildren();activeIndex=-1;currentItems=items;if(!items.length){hideSuggestions();return}const title=document.createElement("div");title.className="suggestion-heading";title.textContent=query.value.trim()?"추천 검색어":"최근 검색어";suggestions.append(title);items.forEach((item,i)=>{const b=document.createElement("button");b.type="button";b.className="suggestion-item";b.role="option";b.setAttribute("aria-selected","false");const icon=document.createElement("span");icon.className="suggestion-symbol";icon.textContent=item.type==="최근 검색"?"◷":"⌕";const label=document.createElement("span");label.className="suggestion-label";label.textContent=item.term;const type=document.createElement("span");type.className="suggestion-type";type.textContent=item.type;b.append(icon,label,type);b.addEventListener("mousedown",e=>e.preventDefault());b.addEventListener("click",()=>runSearch(item.term));suggestions.append(b)});suggestions.hidden=false;query.setAttribute("aria-expanded","true")}
function hideSuggestions(){suggestions.hidden=true;query.setAttribute("aria-expanded","false");activeIndex=-1}
function moveSelection(delta){const buttons=[...suggestions.querySelectorAll(".suggestion-item")];if(!buttons.length)return;activeIndex=(activeIndex+delta+buttons.length)%buttons.length;buttons.forEach((b,i)=>{b.classList.toggle("selected",i===activeIndex);b.setAttribute("aria-selected",String(i===activeIndex))});query.value=currentItems[activeIndex].term}
function runSearch(value){const term=String(value||"").trim();if(!term){query.focus();return}history=[term,...history.filter(x=>x!==term)].slice(0,30);localStorage.setItem(KEYS.history,JSON.stringify(history));renderHistory();hideSuggestions();const url=endpoints[settings.engine]||endpoints.google;if(settings.newTab)window.open(url(term),"_blank","noopener,noreferrer");else window.location.href=url(term)}
function openSettings(){syncSettingsForm();$("#settings-modal").hidden=false;$("#settings-close").focus()}
function closeSettings(){$("#settings-modal").hidden=true;$("#settings-open").focus()}
function syncSettingsForm(){$("#default-engine").value=settings.engine;$("#new-tab").checked=settings.newTab;$("#autocomplete").checked=settings.autocomplete;$("#history-suggestions").checked=settings.historySuggestions;$("#suggestion-count").value=String(settings.suggestionCount);document.querySelectorAll("[data-theme]").forEach(b=>b.classList.toggle("active",b.dataset.theme===settings.theme))}
function readForm(){settings={theme:settings.theme,engine:$("#default-engine").value,newTab:$("#new-tab").checked,autocomplete:$("#autocomplete").checked,historySuggestions:$("#history-suggestions").checked,suggestionCount:Number($("#suggestion-count").value)};saveSettings();applyTheme();setEngine(settings.engine);hideSuggestions()}
document.querySelectorAll(".engine").forEach(b=>b.addEventListener("click",()=>setEngine(b.dataset.engine)));
$("#search-form").addEventListener("submit",e=>{e.preventDefault();runSearch(query.value)});
query.addEventListener("input",renderSuggestions);
query.addEventListener("keydown",e=>{if(e.key==="ArrowDown"&&!suggestions.hidden){e.preventDefault();moveSelection(1)}else if(e.key==="ArrowUp"&&!suggestions.hidden){e.preventDefault();moveSelection(-1)}else if(e.key==="Enter"&&activeIndex>=0&&!suggestions.hidden){e.preventDefault();runSearch(currentItems[activeIndex].term)}else if(e.key==="Escape")hideSuggestions()});
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))hideSuggestions()});
$("#clear-history").addEventListener("click",()=>{history=[];localStorage.removeItem(KEYS.history);renderHistory();hideSuggestions()});
$("#settings-open").addEventListener("click",openSettings);$("#settings-close").addEventListener("click",closeSettings);$("#settings-done").addEventListener("click",()=>{readForm();closeSettings()});
$("#settings-modal").addEventListener("click",e=>{if(e.target===$("#settings-modal"))closeSettings()});
document.querySelectorAll("[data-theme]").forEach(b=>b.addEventListener("click",()=>{settings.theme=b.dataset.theme;applyTheme();document.querySelectorAll("[data-theme]").forEach(x=>x.classList.toggle("active",x===b))}));
$("#reset-settings").addEventListener("click",()=>{settings={...defaults};syncSettingsForm();applyTheme();saveSettings();setEngine(settings.engine)});
if(window.matchMedia){matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(settings.theme==="system")applyTheme()})}
applyTheme();setEngine(settings.engine);renderHistory();syncSettingsForm();
})();