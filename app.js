(()=>{
"use strict";
const $=s=>document.querySelector(s);
const KEYS={settings:"is-settings-v2",history:"is-history-v2"};
const defaults={theme:"dark",engine:"google",newTab:false,autocomplete:true,historySuggestions:true,suggestionCount:6,customName:"내 검색",customUrl:""};
const endpoints={google:q=>"https://www.google.com/search?q="+encodeURIComponent(q),naver:q=>"https://search.naver.com/search.naver?query="+encodeURIComponent(q),namu:q=>"https://namu.wiki/w/"+encodeURIComponent(q)};
const safeRead=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}};
let oldEngine=localStorage.getItem("is-engine"),oldHistory=safeRead("is-history",[]);
let settings={...defaults,...safeRead(KEYS.settings,{})};
if(!localStorage.getItem(KEYS.settings)&&["google","naver","namu"].includes(oldEngine))settings.engine=oldEngine;
let history=safeRead(KEYS.history,oldHistory);if(!Array.isArray(history))history=[];
history=history.filter(x=>typeof x==="string").slice(0,30);
let activeIndex=-1,currentItems=[];
const query=$("#query"),suggestions=$("#suggestions");
const normalize=s=>String(s).toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
function initials(s){return [...String(s)].map(ch=>{const n=ch.charCodeAt(0)-44032;return n>=0&&n<=11171?String.fromCharCode(4352+Math.floor(n/588)):ch}).join("")}
function applyTheme(){const theme=settings.theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):settings.theme;document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]').content=theme==="dark"?"#0b1020":"#f4f7fc"}
function setEngine(engine){settings.engine=engine;saveSettings();document.querySelectorAll(".engine").forEach(b=>b.classList.toggle("active",b.dataset.engine===engine));$("#custom-engine-label").textContent=settings.customName||"내 검색"}
function renderHistory(){const root=$("#history-list");root.replaceChildren();if(!history.length){const p=document.createElement("span");p.className="empty-history";p.textContent="아직 검색 기록이 없어요.";root.append(p);return}history.slice(0,12).forEach(term=>{const b=document.createElement("button");b.type="button";b.className="history-chip";b.textContent=term;b.addEventListener("click",()=>runSearch(term));root.append(b)})}
function rankSuggestions(raw){
 const q=normalize(raw.trim());if(!q)return settings.historySuggestions?history.slice(0,settings.suggestionCount).map(term=>({term,type:"최근 검색",reason:"다시 검색"})):[];
 const found=[],seen=new Set();
 const add=(term,category,score,reason)=>{const key=normalize(term);if(!key||seen.has(key))return;seen.add(key);found.push({term,type:category,score,reason})};
 if(settings.historySuggestions)history.forEach(term=>{const t=normalize(term);if(t===q)add(term,"최근 검색",-2,"완전히 일치");else if(t.startsWith(q))add(term,"최근 검색",0,"검색어 앞부분");else if(t.includes(q))add(term,"최근 검색",5,"검색어 포함");else if(initials(term).toLowerCase().startsWith(q))add(term,"최근 검색",7,"초성 일치")});
 (window.SEARCH_DATA||[]).forEach(item=>{
  const term=normalize(item.term),als=(item.aliases||[]).map(normalize);
  if(term===q)add(item.term,item.category,-1,"정확히 일치");
  else if(term.startsWith(q))add(item.term,item.category,1,"앞부분 일치");
  else if(als.some(x=>x===q))add(item.term,item.category,2,"별칭 일치");
  else if(als.some(x=>x.startsWith(q)))add(item.term,item.category,3,"별칭으로 찾음");
  else if(term.includes(q))add(item.term,item.category,4,"중간 글자 일치");
  else if(als.some(x=>x.includes(q)))add(item.term,item.category,5,"관련어 일치");
  else if(initials(item.term).toLowerCase().startsWith(q))add(item.term,item.category,6,"초성 일치");
  else if(als.some(x=>initials(x).toLowerCase().startsWith(q)))add(item.term,item.category,7,"별칭 초성 일치");
 });
 return found.sort((a,b)=>a.score-b.score||a.term.localeCompare(b.term,"ko")).slice(0,settings.suggestionCount)
}
function renderSuggestions(){
 if(!settings.autocomplete){hideSuggestions();return}
 const items=rankSuggestions(query.value);suggestions.replaceChildren();activeIndex=-1;currentItems=items;
 if(!items.length){hideSuggestions();return}
 const title=document.createElement("div");title.className="suggestion-heading";title.textContent=query.value.trim()?"검색 추천":"최근 검색어";suggestions.append(title);
 items.forEach((item,i)=>{
  const b=document.createElement("button");b.type="button";b.className="suggestion-item";b.setAttribute("role","option");b.setAttribute("aria-selected","false");
  const icon=document.createElement("span");icon.className="suggestion-symbol";icon.textContent=item.type==="최근 검색"?"◷":"⌕";
  const body=document.createElement("span");body.className="suggestion-body";
  const label=document.createElement("span");label.className="suggestion-label";label.textContent=item.term;
  const meta=document.createElement("span");meta.className="suggestion-meta";
  const category=document.createElement("span");category.className="suggestion-type";category.textContent=item.type;
  const reason=document.createElement("span");reason.className="suggestion-reason";reason.textContent=item.reason;
  meta.append(category,reason);body.append(label,meta);
  const arrow=document.createElement("span");arrow.className="suggestion-arrow";arrow.textContent="↵";
  b.append(icon,body,arrow);b.addEventListener("mousedown",e=>e.preventDefault());b.addEventListener("click",()=>runSearch(item.term));suggestions.append(b)
 });
 suggestions.hidden=false;query.setAttribute("aria-expanded","true")
}
function hideSuggestions(){suggestions.hidden=true;query.setAttribute("aria-expanded","false");activeIndex=-1}
function moveSelection(delta){const buttons=[...suggestions.querySelectorAll(".suggestion-item")];if(!buttons.length)return;activeIndex=(activeIndex+delta+buttons.length)%buttons.length;buttons.forEach((b,i)=>{b.classList.toggle("selected",i===activeIndex);b.setAttribute("aria-selected",String(i===activeIndex))});query.value=currentItems[activeIndex].term}
function makeSearchUrl(term){
 if(settings.engine!=="custom")return (endpoints[settings.engine]||endpoints.google)(term);
 const template=String(settings.customUrl||"").trim();
 if(!template||(!template.includes("{query}")&&!template.includes("%s")))return null;
 try{
  const candidate=template.replaceAll("{query}",encodeURIComponent(term)).replaceAll("%s",encodeURIComponent(term));
  const parsed=new URL(candidate);
  if(!["http:","https:"].includes(parsed.protocol))return null;
  return parsed.href;
 }catch{return null}
}
function runSearch(value){const term=String(value||"").trim();if(!term){query.focus();return}const target=makeSearchUrl(term);if(!target){alert("사용자 지정 검색 링크를 확인해 주세요. URL에 {query} 또는 %s가 필요하고 https:// 또는 http://로 시작해야 합니다.");openSettings();return}history=[term,...history.filter(x=>x!==term)].slice(0,30);localStorage.setItem(KEYS.history,JSON.stringify(history));renderHistory();hideSuggestions();if(settings.newTab)window.open(target,"_blank","noopener,noreferrer");else window.location.href=target}
function openSettings(){syncSettingsForm();$("#settings-modal").hidden=false;$("#settings-close").focus()}
function closeSettings(){$("#settings-modal").hidden=true;$("#settings-open").focus()}
function syncSettingsForm(){$("#default-engine").value=settings.engine;$("#custom-name").value=settings.customName||"내 검색";$("#custom-url").value=settings.customUrl||"";$("#custom-engine-label").textContent=settings.customName||"내 검색";$("#new-tab").checked=settings.newTab;$("#autocomplete").checked=settings.autocomplete;$("#history-suggestions").checked=settings.historySuggestions;$("#suggestion-count").value=String(settings.suggestionCount);document.querySelectorAll("[data-theme]").forEach(b=>b.classList.toggle("active",b.dataset.theme===settings.theme))}
function readForm(){settings={theme:settings.theme,engine:$("#default-engine").value,customName:$("#custom-name").value.trim()||"내 검색",customUrl:$("#custom-url").value.trim(),newTab:$("#new-tab").checked,autocomplete:$("#autocomplete").checked,historySuggestions:$("#history-suggestions").checked,suggestionCount:Number($("#suggestion-count").value)};if(settings.engine==="custom"&&(!settings.customUrl||(!settings.customUrl.includes("{query}")&&!settings.customUrl.includes("%s")))){alert("사용자 지정 검색 URL에 {query} 또는 %s를 입력해 주세요.");$("#custom-url").focus();return false}if(settings.customUrl){try{const test=new URL(settings.customUrl.replaceAll("{query}","test").replaceAll("%s","test"));if(!["http:","https:"].includes(test.protocol))throw new Error()}catch{alert("검색 URL은 올바른 http:// 또는 https:// 주소여야 합니다.");$("#custom-url").focus();return false}}saveSettings();applyTheme();setEngine(settings.engine);hideSuggestions();return true}
document.querySelectorAll(".engine").forEach(b=>b.addEventListener("click",()=>setEngine(b.dataset.engine)));
$("#search-form").addEventListener("submit",e=>{e.preventDefault();runSearch(query.value)});
query.addEventListener("input",renderSuggestions);
query.addEventListener("keydown",e=>{if(e.key==="ArrowDown"&&!suggestions.hidden){e.preventDefault();moveSelection(1)}else if(e.key==="ArrowUp"&&!suggestions.hidden){e.preventDefault();moveSelection(-1)}else if(e.key==="Enter"&&activeIndex>=0&&!suggestions.hidden){e.preventDefault();runSearch(currentItems[activeIndex].term)}else if(e.key==="Escape")hideSuggestions()});
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))hideSuggestions()});
$("#clear-history").addEventListener("click",()=>{history=[];localStorage.removeItem(KEYS.history);renderHistory();hideSuggestions()});
$("#settings-open").addEventListener("click",openSettings);$("#settings-close").addEventListener("click",closeSettings);$("#settings-done").addEventListener("click",()=>{if(readForm())closeSettings()});
$("#settings-modal").addEventListener("click",e=>{if(e.target===$("#settings-modal"))closeSettings()});
document.querySelectorAll("[data-theme]").forEach(b=>b.addEventListener("click",()=>{settings.theme=b.dataset.theme;applyTheme();document.querySelectorAll("[data-theme]").forEach(x=>x.classList.toggle("active",x===b))}));
$("#reset-settings").addEventListener("click",()=>{settings={...defaults};syncSettingsForm();applyTheme();saveSettings();setEngine(settings.engine)});
if(window.matchMedia){matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(settings.theme==="system")applyTheme()})}
applyTheme();setEngine(settings.engine);renderHistory();syncSettingsForm();
})();