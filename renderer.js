'use strict';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
const COLLECTIONS = ['projects','tasks','projectItems','notes','reminders','ideas','websites','contacts','goals','accounts','transactions','habits','habitLogs','moods','events'];
const TITLES = {dashboard:'نمای امروز',tasks:'وظایف',projects:'پروژه‌ها',calendar:'تقویم شمسی',reminders:'یادآورها',ideas:'بانک ایده',websites:'وب‌سایت‌ها',contacts:'مخاطبین',notes:'یادداشت‌ها',goals:'اهداف',finance:'حسابداری شخصی',habits:'ردیاب عادت',mood:'ردیاب خلق‌وخو',methods:'روش‌های بهره‌وری',assistant:'دستیار هوشمند',settings:'تنظیمات'};
const LABELS = {inbox:'صندوق ورودی',todo:'برای انجام',doing:'در حال انجام',waiting:'منتظر',done:'تکمیل‌شده',cancelled:'لغوشده',personal:'شخصی',work:'کاری',low:'کم',medium:'متوسط',high:'زیاد',urgent:'فوری',critical:'بحرانی',must:'باید انجام شود',should:'بهتر است انجام شود',want:'در صورت امکان',q1:'فوری و مهم',q2:'مهم، غیرفوری',q3:'فوری، کم‌اهمیت',q4:'غیرفوری و کم‌اهمیت',income:'درآمد',expense:'هزینه',cash:'نقدی',bank:'بانکی',wallet:'کیف پول',active:'فعال',paused:'متوقف',completed:'تکمیل‌شده',captured:'ثبت اولیه',sorting:'در حال بررسی',ready:'آماده اقدام',archived:'بایگانی'};
const MOODS = [{id:'great',face:'😁',label:'عالی'},{id:'good',face:'🙂',label:'خوب'},{id:'neutral',face:'😐',label:'معمولی'},{id:'low',face:'😕',label:'کم‌انرژی'},{id:'bad',face:'😣',label:'نامطلوب'}];
let state = null;
let currentPage = 'dashboard';
let currentProjectId = null;
let reminderFilter = 'all';
let taskQuery = '';
let taskView = 'kanban';
let calendarCursor = Jalali.parts(new Date());
let selectedCalendarDate = new Date();
let datePickerTarget = null;
let pickerCursor = null;
let chatBusy = false;
let toastTimer = null;

function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function alive(section) { return (state?.[section] || []).filter(x => !x._deleted_at); }
function byId(section,id) { return alive(section).find(x=>x.id===id); }
function uid(prefix='item') { return prefix+'_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-5); }
function isoNow(){return new Date().toISOString();}
function localDateKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function parseDate(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function shortDate(value){const d=parseDate(value);return d?Jalali.format(d):'بدون تاریخ';}
function dateTimeLabel(value){const d=parseDate(value);return d?`${Jalali.format(d)} · ${new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit'}).format(d)}`:'بدون زمان';}
function digits(value){return Jalali.faDigits(String(value));}
function num(value){return Number(value||0).toLocaleString('fa-IR');}
function money(value,currency='IRR'){const unit={IRR:'تومان',USD:'دلار',EUR:'یورو'}[currency]||currency||'واحد';return `${num(value)} ${unit}`;}
function totalsByCurrency(rows,type){const totals={};for(const tx of rows.filter(x=>x.type===type)){const currency=byId('accounts',tx.account_id)?.currency||'IRR';totals[currency]=(totals[currency]||0)+Number(tx.amount||0);}const entries=Object.entries(totals);return entries.length?entries.map(([currency,value])=>money(value,currency)).join(' · '):money(0,'IRR');}
function netByCurrency(rows){const totals={};for(const tx of rows){const currency=byId('accounts',tx.account_id)?.currency||'IRR';totals[currency]=(totals[currency]||0)+(tx.type==='income'?1:-1)*Number(tx.amount||0);}const entries=Object.entries(totals);return entries.length?entries.map(([currency,value])=>money(value,currency)).join(' · '):money(0,'IRR');}
function isToday(value){const d=parseDate(value);if(!d)return false;const n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();}
function isOverdue(value){const d=parseDate(value);if(!d)return false;const now=new Date();now.setHours(0,0,0,0);d.setHours(0,0,0,0);return d<now;}
function urgencyBadge(value){const v=value||'medium';return `<span class="badge ${esc(v)}">فوریت: ${esc(LABELS[v]||v)}</span>`;}
function priorityBadge(value){return `<span class="badge ${esc(value||'medium')}">اهمیت: ${esc(LABELS[value]||value||'متوسط')}</span>`;}
function guide(title,text){return `<div class="guide"><span class="guide-icon">ⓘ</span><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div></div>`;}
function empty(title,description,icon='✦'){return `<div class="empty-state"><span class="empty-icon">${icon}</span><strong>${esc(title)}</strong>${esc(description)}</div>`;}
function heading(title,desc,action=''){return `<div class="page-heading"><div><div class="eyebrow">SMARTDAY PERSONAL SPACE</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${action}</div>`;}
function activeCount(section){return alive(section).length;}
function applyTheme(){
  const pref=state?.settings?.theme||'system';
  const dark=pref==='dark'||(pref==='system'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.body.dataset.theme=dark?'dark':'light';
}
async function persist(){
  const clean=JSON.parse(JSON.stringify(state));
  delete clean.settings.hasApiKey; delete clean.settings.hasSyncToken; delete clean.settings.dataPath;
  state=await window.smartday.saveState(clean); applyTheme(); updateNavCounters();
}
function toast(message,error=false){const node=$('#toast');node.textContent=message;node.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.className='toast',3300);}
function updateNavCounters(){
  if(!state)return;
  const today=alive('tasks').filter(t=>t.status!=='done'&&isToday(t.due_at)).length;
  const open=alive('tasks').filter(t=>!['done','cancelled'].includes(t.status)).length;
  $('#navTodayCount').textContent=num(today);$('#navTaskCount').textContent=num(open);
}
function setPage(page){
  if(!TITLES[page])return;
  currentPage=page;currentProjectId=null;
  $$('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('#pageTitle').textContent=TITLES[page];
  $('#pageRoot').innerHTML=renderPage(page);
  $('#sidebar').classList.remove('open');
  updateNavCounters();
}
function renderPage(page){
  switch(page){
    case'dashboard':return renderDashboard();
    case'tasks':return renderTasks();
    case'projects':return renderProjects();
    case'project-detail':return renderProjectDetail();
    case'calendar':return renderCalendar();
    case'reminders':return renderReminders();
    case'ideas':return renderIdeas();
    case'websites':return renderWebsites();
    case'contacts':return renderContacts();
    case'notes':return renderNotes();
    case'goals':return renderGoals();
    case'finance':return renderFinance();
    case'habits':return renderHabits();
    case'mood':return renderMood();
    case'methods':return renderMethods();
    case'assistant':return renderAssistant();
    case'settings':return renderSettings();
    default:return renderDashboard();
  }
}
function renderDashboard(){
  const tasks=alive('tasks').filter(t=>!['done','cancelled'].includes(t.status));
  const today=tasks.filter(t=>isToday(t.due_at));
  const doneToday=alive('tasks').filter(t=>t.status==='done'&&isToday(t.completed_at||t.updated_at)).length;
  const overdue=tasks.filter(t=>isOverdue(t.due_at));
  const activeProjects=alive('projects').filter(p=>p.status!=='completed');
  const nextReminders=alive('reminders').filter(r=>r.active!==false&&parseDate(r.remind_at)).sort((a,b)=>new Date(a.remind_at)-new Date(b.remind_at)).slice(0,4);
  const nextTasks=[...today,...overdue].sort((a,b)=>new Date(a.due_at||'2999')-new Date(b.due_at||'2999')).slice(0,6);
  const currentMood=alive('moods').find(m=>m.date===localDateKey());
  const goalList=alive('goals').filter(g=>g.status!=='completed').slice(0,3);
  const welcomeHour=new Date().getHours();const hello=welcomeHour<12?'صبح بخیر':welcomeHour<17?'روز بخیر':'عصر بخیر';
  return `${`<div class="welcome-row"><div><div class="eyebrow">YOUR PERSONAL COMMAND CENTER</div><h1>${hello}، آماده‌ای؟</h1><p>این نمای کلی برای کمک به تمرکز و تصمیم‌گیری بهتر امروز توست.</p></div><button class="btn primary" data-action="quick-add">＋ ثبت سریع</button></div>`}
  <div class="stats-grid">
    <article class="stat-card"><div class="stat-top"><span>وظایف امروز</span><span class="stat-icon purple">☷</span></div><strong>${num(today.length)}</strong><small>کارهای دارای موعد امروز</small></article>
    <article class="stat-card"><div class="stat-top"><span>تکمیل‌شده امروز</span><span class="stat-icon green">✓</span></div><strong>${num(doneToday)}</strong><small>وظایف تکمیل‌شده</small></article>
    <article class="stat-card"><div class="stat-top"><span>عقب‌افتاده</span><span class="stat-icon amber">◷</span></div><strong>${num(overdue.length)}</strong><small>نیازمند بازبینی و زمان‌بندی</small></article>
    <article class="stat-card"><div class="stat-top"><span>پروژه‌های فعال</span><span class="stat-icon pink">▦</span></div><strong>${num(activeProjects.length)}</strong><small>در حال پیگیری</small></article>
  </div>
  <div class="dashboard-grid">
    <section class="panel-card"><div class="panel-head"><div><h2>تمرکز امروز</h2><p>کارهای نزدیک و مهم را در اولویت قرار بده.</p></div><button class="text-btn" data-page="tasks">همه وظایف ←</button></div>
      <div class="task-list">${nextTasks.length?nextTasks.map(taskRow).join(''):empty('برنامه امروز خالی است','از دکمه ثبت سریع برای اضافه‌کردن اولین کار استفاده کن.','☀')}</div>
    </section>
    <section class="panel-card ai-panel"><div class="panel-head"><div><h2>دستیار هوشمند</h2><p>در صورت اتصال اینترنت، می‌تواند در همه بخش‌ها اقدام کند.</p></div><span class="ai-orb">✧</span></div>
      <div class="ai-intro"><span class="ai-orb">✦</span><div><strong>از فکر تا اقدام</strong><p>می‌توانی ایده‌ها را مرتب کنی، وظیفه بسازی، هدف‌ها را بررسی کنی یا هزینه‌ها را تحلیل کنی.</p></div></div>
      <textarea class="textarea" id="dashboardPrompt" placeholder="مثلاً پروژه جدیدی برای بازطراحی سایت بساز و سه مرحله اولیه آن را تعریف کن..."></textarea>
      <div class="statline" style="margin-top:8px"><small class="muted tiny">هوش مصنوعی تنها قابلیت نیازمند اینترنت است.</small><button class="btn soft small" data-action="send-dashboard-ai">ارسال ↗</button></div>
    </section>
  </div>
  <div class="dashboard-grid">
    <section class="panel-card"><div class="panel-head"><div><h2>یادآورهای بعدی</h2><p>شخصی و کاری</p></div><button class="text-btn" data-page="reminders">مشاهده همه ←</button></div>
      <div class="compact-list">${nextReminders.length?nextReminders.map(r=>`<div class="task-row"><span class="stat-icon ${r.category==='work'?'purple':'pink'}">${r.category==='work'?'▣':'♡'}</span><div class="task-main"><div class="task-title">${esc(r.title)}</div><div class="task-sub">${r.category==='work'?'کاری':'شخصی'} · ${dateTimeLabel(r.remind_at)}</div></div>${urgencyBadge(r.urgency)}</div>`).join(''):empty('یادآور فعالی وجود ندارد','یادآورهای شخصی و کاری خود را ثبت کن.','◷')}</div>
    </section>
    <section class="panel-card"><div class="panel-head"><div><h2>اهداف در مسیر</h2><p>پیشرفت هدف‌های فعال</p></div><button class="text-btn" data-page="goals">همه اهداف ←</button></div>
      <div class="list-plain">${goalList.length?goalList.map(g=>{const pr=goalProgress(g);return `<div><div class="statline"><strong class="tiny">${esc(g.title)}</strong><small class="muted">${num(pr)}٪</small></div><div class="progress" style="margin-top:7px"><i style="width:${pr}%"></i></div></div>`}).join(''):empty('هنوز هدفی تعریف نشده','یک هدف معنادار تعریف کن و قدم‌های آن را پیگیری کن.','⚑')}</div>
    </section>
  </div>
  <div class="dashboard-grid">
    <section class="panel-card"><div class="panel-head"><div><h2>پروژه‌های فعال</h2><p>خلاصه پیشرفت</p></div><button class="text-btn" data-page="projects">همه پروژه‌ها ←</button></div><div class="project-mini-list">${activeProjects.slice(0,4).map(projectMini).join('')||empty('پروژه‌ای ثبت نشده','پروژه‌های بزرگ را تعریف کن و کارها را به آن‌ها متصل کن.','▦')}</div></section>
    <section class="panel-card"><div class="panel-head"><div><h2>حال امروز</h2><p>یک ثبت کوتاه برای شناخت الگوی انرژی روزانه</p></div><button class="text-btn" data-page="mood">تاریخچه ←</button></div>${currentMood?`<div class="mood-summary"><span style="font-size:32px">${MOODS.find(m=>m.id===currentMood.mood)?.face||'😐'}</span><div><strong>${MOODS.find(m=>m.id===currentMood.mood)?.label||'ثبت‌شده'}</strong><small class="muted">خلق‌وخو برای امروز ثبت شده است.</small></div></div>`:`<div class="mood-options">${MOODS.map(m=>`<button class="mood-choice" data-action="quick-mood" data-mood="${m.id}"><span class="face">${m.face}</span><strong>${m.label}</strong></button>`).join('')}</div>`}</section>
  </div>`;
}
function projectProgress(projectId){const all=alive('tasks').filter(t=>t.project_id===projectId);if(!all.length)return 0;return Math.round(all.filter(t=>t.status==='done').length/all.length*100);}
function projectMini(p){const tasks=alive('tasks').filter(t=>t.project_id===p.id);return `<div class="project-mini"><div class="statline"><strong class="tiny">${esc(p.title)}</strong><span class="muted tiny">${num(projectProgress(p.id))}٪</span></div><div class="progress" style="margin-top:7px"><i style="width:${projectProgress(p.id)}%"></i></div></div>`;}
function taskRow(t){return `<div class="task-row"><button class="task-check ${t.status==='done'?'done':''}" data-action="complete-task" data-id="${t.id}">${t.status==='done'?'✓':''}</button><div class="task-main"><div class="task-title ${t.status==='done'?'muted':''}">${esc(t.title)}</div><div class="task-sub">${t.due_at?shortDate(t.due_at):'بدون موعد'}${t.project_id?' · '+esc(byId('projects',t.project_id)?.title||'پروژه'):''}</div></div><div class="task-meta">${t.urgency?urgencyBadge(t.urgency):''}<button class="icon-mini" data-action="edit" data-section="tasks" data-id="${t.id}">✎</button></div></div>`;}
function renderTasks(){
  const tasks=alive('tasks').filter(t=>!taskQuery||`${t.title} ${t.description||''}`.toLowerCase().includes(taskQuery.toLowerCase()));
  const activeMethod=taskView;
  return `${heading('وظایف','همه کارها در یک فضا؛ با فوریت، اهمیت، موعد و ارتباط با پروژه‌ها.','<button class="btn primary" data-action="add" data-section="tasks">＋ وظیفه جدید</button>')}
    ${guide('چطور از این بخش استفاده کنی؟','وظایف کوچک و قابل انجام ثبت کن. پروژه و موعد را مشخص کن، فوریت را جدا از اهمیت تعیین کن و با روش بهره‌وری انتخابی، فهرست روزت را مرتب کن.')}
    <div class="toolbar"><div class="searchbox"><span>⌕</span><input class="input" id="taskSearch" value="${esc(taskQuery)}" placeholder="جست‌وجو در وظایف..."></div><select class="select" id="taskView"><option value="kanban" ${activeMethod==='kanban'?'selected':''}>نمای کانبان</option><option value="mustshouldwant" ${activeMethod==='mustshouldwant'?'selected':''}>Must / Should / Want</option><option value="eisenhower" ${activeMethod==='eisenhower'?'selected':''}>ماتریس آیزنهاور</option><option value="list" ${activeMethod==='list'?'selected':''}>فهرست</option></select><select class="select" id="taskFilterProject"><option value="all">همه پروژه‌ها</option>${alive('projects').map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></div>
    <div id="taskWorkspace">${renderTaskView(tasks,activeMethod)}</div>`;
}
function renderTaskView(tasks,method){
  const lanes=method==='kanban'?[['inbox','صندوق ورودی'],['todo','برای انجام'],['doing','در حال انجام'],['waiting','منتظر'],['done','تکمیل‌شده']]:method==='mustshouldwant'?[['must','باید انجام شود'],['should','بهتر است انجام شود'],['want','در صورت امکان']]:null;
  if(lanes){const key=method==='kanban'?'status':'planning_bucket';return `<div class="board">${lanes.map(([id,title])=>{const rows=tasks.filter(t=>(t[key]|| (method==='mustshouldwant'?'should':'todo'))===id);return `<div class="board-col"><div class="board-head"><strong>${title}</strong><span>${num(rows.length)}</span></div>${rows.length?rows.map(t=>`<div class="board-card" data-action="edit" data-section="tasks" data-id="${t.id}"><strong>${esc(t.title)}</strong><small>${t.due_at?shortDate(t.due_at):'بدون موعد'} · ${esc(byId('projects',t.project_id)?.title||'بدون پروژه')}</small><div style="margin-top:7px">${urgencyBadge(t.urgency)}</div><div class="card-actions" style="margin-top:7px"><button class="btn small" data-action="complete-task" data-id="${t.id}">✓ تکمیل</button></div></div>`).join(''):empty('موردی در این ستون نیست','با افزودن وظیفه، آن را اینجا مدیریت کن.','＋')}</div>`}).join('')}</div>`;}
  if(method==='eisenhower'){
    const cells=[['q1','فوری و مهم','همین حالا انجام بده'],['q2','مهم، غیرفوری','برای آن زمان مشخص کن'],['q3','فوری، کم‌اهمیت','واگذار یا ساده‌سازی کن'],['q4','غیرفوری و کم‌اهمیت','حذف یا محدود کن']];
    return `<div class="matrix">${cells.map(([id,title,desc])=>`<div class="matrix-cell ${id}"><h3>${title}</h3><p>${desc}</p>${tasks.filter(t=>(t.eisenhower||'q2')===id).map(t=>`<div class="board-card" data-action="edit" data-section="tasks" data-id="${t.id}"><strong>${esc(t.title)}</strong><small>${t.due_at?shortDate(t.due_at):'بدون موعد'}</small></div>`).join('')||'<span class="tiny muted">وظیفه‌ای در این خانه نیست.</span>'}</div>`).join('')}</div>`;
  }
  return `<div class="list-plain">${tasks.length?tasks.map(taskRow).join(''):empty('وظیفه‌ای پیدا نشد','یک وظیفه جدید ثبت کن یا فیلتر جست‌وجو را تغییر بده.','☷')}</div>`;
}
function renderProjects(){
  const rows=alive('projects');
  return `${heading('پروژه‌ها','پروژه را به‌عنوان یک نتیجه بزرگ تعریف کن و امور، وظایف و یادداشت‌های مرتبط را درون آن نگه دار.','<button class="btn primary" data-action="add" data-section="projects">＋ پروژه جدید</button>')}
    ${guide('ساختار هر پروژه','پس از ایجاد پروژه، صفحه اختصاصی آن را باز کن. در همان صفحه می‌توانی وظایف و امور اجرایی، یادداشت‌ها، لینک‌ها و میزان پیشرفت پروژه را مدیریت کنی.')}
    <div class="card-grid">${rows.length?rows.map(p=>{const count=alive('tasks').filter(t=>t.project_id===p.id).length;const done=alive('tasks').filter(t=>t.project_id===p.id&&t.status==='done').length;return `<article class="entity-card"><div class="entity-top"><div class="entity-mark">▦</div><div class="entity-title-wrap"><div class="entity-title">${esc(p.title)}</div><div class="task-sub">${esc(LABELS[p.status]||p.status||'فعال')} · ${count} وظیفه</div></div>${urgencyBadge(p.urgency)}</div><p class="entity-desc">${esc(p.description||'برای این پروژه توضیحی ثبت نشده است.')}</p><div class="progress-label"><span>پیشرفت</span><b>${num(projectProgress(p.id))}٪</b></div><div class="progress"><i style="width:${projectProgress(p.id)}%"></i></div><div class="entity-foot"><span class="tiny muted">${num(done)} از ${num(count)} انجام شده</span><div class="card-actions"><button class="btn soft small" data-action="open-project" data-id="${p.id}">ورود به پروژه</button><button class="icon-mini" data-action="edit" data-section="projects" data-id="${p.id}">✎</button><button class="icon-mini" data-action="archive" data-section="projects" data-id="${p.id}">⌫</button></div></div></article>`}).join(''):empty('پروژه‌ای ایجاد نشده','اولین پروژه‌ات را تعریف کن؛ وظایف و یادداشت‌های مرتبط را در صفحه همان پروژه جمع‌آوری خواهی کرد.','▦')}</div>`;
}
function renderProjectDetail(){
  const p=byId('projects',currentProjectId);if(!p){currentPage='projects';return renderProjects();}
  const tasks=alive('tasks').filter(t=>t.project_id===p.id);const affairs=alive('projectItems').filter(t=>t.project_id===p.id);const notes=alive('notes').filter(n=>n.project_id===p.id);
  return `<div class="page-heading"><div><button class="text-btn" data-page="projects">← بازگشت به پروژه‌ها</button><div class="eyebrow">PROJECT WORKSPACE</div><h1>${esc(p.title)}</h1><p>${esc(p.description||'فضای اختصاصی امور و مستندات پروژه')}</p></div><button class="btn" data-action="edit" data-section="projects" data-id="${p.id}">ویرایش پروژه</button></div>
  <div class="stats-grid"><article class="stat-card"><div class="stat-top">امور پروژه</div><strong>${num(affairs.length)}</strong><small>موارد اجرایی و پیگیری‌ها</small></article><article class="stat-card"><div class="stat-top">کل وظایف</div><strong>${num(tasks.length)}</strong><small>وظایف مرتبط با پروژه</small></article><article class="stat-card"><div class="stat-top">انجام‌شده</div><strong>${num(tasks.filter(t=>t.status==='done').length)}</strong><small>خروجی تکمیل‌شده</small></article><article class="stat-card"><div class="stat-top">یادداشت‌ها</div><strong>${num(notes.length)}</strong><small>اطلاعات و تصمیم‌ها</small></article><article class="stat-card"><div class="stat-top">پیشرفت</div><strong>${num(projectProgress(p.id))}٪</strong><small>بر اساس وظایف تکمیل‌شده</small></article></div>
  <div class="dashboard-grid"><section class="panel-card"><div class="panel-head"><div><h2>امور پروژه</h2><p>پیگیری‌ها، موضوعات و اقدام‌های کلان مرتبط را ثبت کن.</p></div><button class="btn primary small" data-action="add" data-section="projectItems" data-project="${p.id}">＋ ثبت امر</button></div><div class="task-list">${affairs.length?affairs.map(a=>`<div class="task-row"><div class="task-main"><div class="task-title">${esc(a.title)}</div><div class="task-sub">${esc(LABELS[a.status]||'برای انجام')} · ${a.due_at?shortDate(a.due_at):'بدون موعد'}</div></div>${urgencyBadge(a.urgency)}<button class="icon-mini" data-action="edit" data-section="projectItems" data-id="${a.id}">✎</button></div>`).join(''):empty('امری برای پروژه ثبت نشده','موضوعات کلان و مواردی را که باید در این پروژه پیگیری کنی ثبت کن.','⚑')}</div></section><section class="panel-card"><div class="panel-head"><div><h2>وظایف اجرایی پروژه</h2><p>کارهای مشخص و قابل انجام را با وضعیت و موعد مدیریت کن.</p></div><button class="btn primary small" data-action="add" data-section="tasks" data-project="${p.id}">＋ افزودن وظیفه</button></div><div class="task-list">${tasks.length?tasks.map(taskRow).join(''):empty('وظیفه‌ای برای پروژه ثبت نشده','امور را به وظایف کوچک و قابل انجام تبدیل کن.','☷')}</div></section>
  <section class="panel-card"><div class="panel-head"><div><h2>یادداشت‌های پروژه</h2><p>تصمیم‌ها، صورت‌جلسه‌ها و اطلاعات مرتبط</p></div><button class="btn small" data-action="add" data-section="notes" data-project="${p.id}">＋ یادداشت</button></div><div class="list-plain">${notes.length?notes.map(n=>`<div class="task-row"><div class="task-main"><div class="task-title">${esc(n.title)}</div><div class="task-sub">${esc((n.content||'').slice(0,110))}</div></div><button class="icon-mini" data-action="edit" data-section="notes" data-id="${n.id}">✎</button></div>`).join(''):empty('یادداشتی ثبت نشده','اطلاعات مهم پروژه را به‌صورت یادداشت نگه دار.','▤')}</div></section></div>`;
}
function reminderRows(){return alive('reminders').filter(r=>r.active!==false&&(!r._deleted_at)&&(reminderFilter==='all'||r.category===reminderFilter)).sort((a,b)=>new Date(a.remind_at)-new Date(b.remind_at));}
function renderReminders(){const rows=reminderRows();return `${heading('یادآورها','یادآورهای شخصی و کاری را جدا نگه دار و برای پیگیری‌های تکرارشونده زمان‌بندی تعریف کن.','<button class="btn primary" data-action="add" data-section="reminders">＋ یادآور جدید</button>')}
${guide('یادآور قابل اتکا','برنامه در System Tray باز می‌ماند و یادآورها را حتی وقتی پنجره اصلی بسته است بررسی می‌کند. برای دریافت اعلان، SmartDay باید در پس‌زمینه فعال باشد. تکرارهای روزانه، هفتگی و ماهانه از تاریخ محلی سیستم محاسبه می‌شوند.')}
<div class="reminder-tabs"><button class="tab-pill ${reminderFilter==='all'?'active':''}" data-action="reminder-filter" data-filter="all">همه</button><button class="tab-pill ${reminderFilter==='personal'?'active':''}" data-action="reminder-filter" data-filter="personal">♡ امور شخصی</button><button class="tab-pill ${reminderFilter==='work'?'active':''}" data-action="reminder-filter" data-filter="work">▣ امور کاری</button></div>
<div class="list-plain">${rows.length?rows.map(r=>`<div class="task-row"><span class="stat-icon ${r.category==='work'?'purple':'pink'}">${r.category==='work'?'▣':'♡'}</span><div class="task-main"><div class="task-title">${esc(r.title)}</div><div class="task-sub">${dateTimeLabel(r.remind_at)} · ${r.category==='work'?'کاری':'شخصی'} · ${({none:'بدون تکرار',daily:'روزانه',weekly:'هفتگی',monthly:'ماهانه'})[r.repeat||'none']}</div></div>${urgencyBadge(r.urgency)}<div class="card-actions"><button class="icon-mini" data-action="snooze" data-id="${r.id}">＋۱۰د</button><button class="icon-mini" data-action="complete-reminder" data-id="${r.id}">✓</button><button class="icon-mini" data-action="edit" data-section="reminders" data-id="${r.id}">✎</button></div></div>`).join(''):empty('یادآوری در این فهرست وجود ندارد','با ثبت اولین یادآور، برنامه زمان آن را کنترل می‌کند.','◷')}</div>`;}
function renderIdeas(){const rows=alive('ideas');const groups=[['captured','ایده‌های تازه'],['sorting','در حال مرتب‌سازی'],['ready','آماده اقدام']];return `${heading('بانک ایده','تمام جرقه‌های ذهنی را سریع ثبت کن؛ سپس آن‌ها را دسته‌بندی، شفاف و به پروژه یا وظیفه تبدیل کن.','<button class="btn primary" data-action="add" data-section="ideas">＋ ثبت ایده</button>')}
${guide('روش مرتب‌سازی افکار','ابتدا بدون قضاوت ایده‌ها را ثبت کن. سپس برای هر ایده موضوع، هدف، ارزش احتمالی و گام بعدی را مشخص کن. دستیار هوشمند می‌تواند ایده‌های مشابه را پیدا کند، دسته‌بندی پیشنهاد دهد و ایده آماده را به پروژه یا وظیفه تبدیل کند.')}
<div class="toolbar"><button class="btn soft" data-action="organize-ideas">✧ مرتب‌سازی افکار با AI</button><span class="muted tiny">${num(rows.length)} ایده ثبت‌شده</span></div>
<div class="idea-columns">${groups.map(([id,title])=>{const subset=rows.filter(x=>(x.status||'captured')===id);return `<div class="idea-col"><h3>${title}<span>${num(subset.length)}</span></h3>${subset.length?subset.map(i=>`<article class="idea-item"><h3>${esc(i.title)}</h3><p>${esc(i.content||'بدون توضیح')}</p><div class="idea-tags">${i.category?`<span class="badge primary">${esc(i.category)}</span>`:''}${(i.tags||[]).map(tag=>`<span class="badge low">${esc(tag)}</span>`).join('')}${urgencyBadge(i.urgency)}</div>${i.next_step?`<p class="field-hint">گام بعدی: ${esc(i.next_step)}</p>`:''}<div class="entity-foot"><small class="muted tiny">${shortDate(i.created_at)}</small><div class="card-actions"><button class="icon-mini" data-action="edit" data-section="ideas" data-id="${i.id}">✎</button><button class="icon-mini" data-action="convert-idea" data-id="${i.id}">↗</button></div></div></article>`).join(''):empty('ایده‌ای در این مرحله نیست','ایده‌ها را ثبت یا به این مرحله منتقل کن.','✧')}</div>`}).join('')}</div>`;}
function renderWebsites(){const rows=alive('websites');return `${heading('وب‌سایت‌های موردنیاز','لینک‌های مرجع و وب‌سایت‌هایی را که باید بررسی یا استفاده کنی ذخیره کن.','<button class="btn primary" data-action="add" data-section="websites">＋ افزودن وب‌سایت</button>')}
${guide('ثبت هوشمند لینک','هنگام افزودن لینک، دکمه «استخراج عنوان و توضیحات» اطلاعات متای صفحه را از اینترنت دریافت می‌کند. سپس می‌توانی با کمک هوش مصنوعی دسته‌بندی مناسب، کاربرد و اولویت آن را مشخص کنی. ذخیره و مشاهده لینک‌ها آفلاین است؛ فقط استخراج متا و دسته‌بندی AI به اینترنت نیاز دارند.')}
<div class="card-grid">${rows.length?rows.map(w=>`<article class="entity-card"><div class="entity-top"><div class="entity-mark">◎</div><div class="entity-title-wrap"><div class="entity-title">${esc(w.title||w.url)}</div><div class="task-sub ltr">${esc(new URLSafeHost(w.url))}</div></div>${w.category?`<span class="badge primary">${esc(w.category)}</span>`:''}</div><p class="entity-desc">${esc(w.description||'توضیحی از این وب‌سایت ثبت نشده است.')}</p><div class="entity-foot"><span>${urgencyBadge(w.urgency)}</span><div class="card-actions"><a class="icon-mini" href="${esc(w.url)}" target="_blank" rel="noreferrer" title="باز کردن">↗</a><button class="icon-mini" data-action="categorize-website" data-id="${w.id}" title="دسته‌بندی با AI">✧</button><button class="icon-mini" data-action="edit" data-section="websites" data-id="${w.id}">✎</button></div></div></article>`).join(''):empty('هنوز لینکی ثبت نشده','وب‌سایت‌های پرکاربرد و منابعی که باید بعداً بررسی شوند را اینجا نگه دار.','◎')}</div>`;}
function URLSafeHost(url){try{return new URL(url).hostname;}catch(_){return url||'';}}
function renderContacts(){const rows=alive('contacts');return `${heading('مخاطبین','شماره تماس، ایمیل، ارتباط کاری و یادداشت‌های مرتبط را در یک دفترچه آفلاین نگه دار.','<button class="btn primary" data-action="add" data-section="contacts">＋ مخاطب جدید</button>')}
${guide('دفترچه ارتباطات','برای هر مخاطب، شماره تماس و زمینه آشنایی یا همکاری را ثبت کن. فوریت می‌تواند نشان دهد چه کسی نیاز به تماس یا پیگیری نزدیک دارد. شماره‌ها فقط در فایل داده محلی برنامه ذخیره می‌شوند.')}
<div class="toolbar"><div class="searchbox"><span>⌕</span><input class="input" id="contactSearch" placeholder="نام، شماره یا سازمان..."></div><span class="muted tiny">${num(rows.length)} مخاطب</span></div><div class="card-grid" id="contactCards">${rows.length?rows.map(c=>contactCard(c)).join(''):empty('مخاطبی ثبت نشده','افراد مهم و راه‌های ارتباطی‌شان را اضافه کن.','♙')}</div>`;}
function contactCard(c){return `<article class="entity-card"><div class="entity-top"><div class="entity-mark">♙</div><div class="entity-title-wrap"><div class="entity-title">${esc(c.name||c.title)}</div><div class="task-sub">${esc(c.organization||c.relation||'مخاطب شخصی')}</div></div>${urgencyBadge(c.urgency)}</div><div class="entity-desc">${c.phone?`<div>☎ <a class="link ltr" href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div>`:''}${c.email?`<div>✉ <a class="link ltr" href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>`:''}${esc(c.notes||'')}</div><div class="entity-foot"><small class="muted tiny">${esc(c.relation||'')}</small><div class="card-actions"><button class="icon-mini" data-action="edit" data-section="contacts" data-id="${c.id}">✎</button><button class="icon-mini" data-action="archive" data-section="contacts" data-id="${c.id}">⌫</button></div></div></article>`;}
function renderNotes(){const rows=alive('notes');return `${heading('یادداشت‌ها','دانش، تصمیم‌ها، پیگیری‌ها و متن‌های کوتاه را ثبت و به پروژه‌ها متصل کن.','<button class="btn primary" data-action="add" data-section="notes">＋ یادداشت جدید</button>')}
${guide('ساختار یادداشت‌ها','یادداشت‌های بدون پروژه در مخزن عمومی ذخیره می‌شوند. هنگام انتخاب پروژه، یادداشت در صفحه اختصاصی همان پروژه نیز نمایش داده خواهد شد. برای یافتن سریع‌تر، عنوان و برچسب روشن انتخاب کن.')}
<div class="card-grid">${rows.length?rows.map(n=>`<article class="entity-card"><div class="entity-top"><div class="entity-mark">▤</div><div class="entity-title-wrap"><div class="entity-title">${esc(n.title)}</div><div class="task-sub">${n.project_id?esc(byId('projects',n.project_id)?.title||'پروژه'): 'یادداشت عمومی'} · ${shortDate(n.updated_at)}</div></div>${urgencyBadge(n.urgency)}</div><p class="entity-desc">${esc((n.content||'').slice(0,230))}${(n.content||'').length>230?'…':''}</p><div class="entity-foot"><span class="muted tiny">${num((n.content||'').length)} نویسه</span><div class="card-actions"><button class="icon-mini" data-action="edit" data-section="notes" data-id="${n.id}">✎</button><button class="icon-mini" data-action="archive" data-section="notes" data-id="${n.id}">⌫</button></div></div></article>`).join(''):empty('یادداشتی وجود ندارد','اطلاعاتی را که ممکن است دوباره به آن نیاز داشته باشی ثبت کن.','▤')}</div>`;}
function goalProgress(g){if(g.project_id){return projectProgress(g.project_id);}const target=Number(g.target||0),current=Number(g.current||0);if(!target)return Number(g.progress||0);return Math.max(0,Math.min(100,Math.round(current/target*100)));}
function renderGoals(){const rows=alive('goals');return `${heading('اهداف','نتیجه‌های مهم کوتاه‌مدت و بلندمدت را تعریف کن و پیشرفت آن‌ها را با شاخص قابل اندازه‌گیری بسنج.','<button class="btn primary" data-action="add" data-section="goals">＋ هدف جدید</button>')}
${guide('هدف قابل پیگیری بساز','برای هر هدف، معیار موفقیت، مقدار هدف، مقدار فعلی و موعد را تعیین کن. می‌توانی هدف را به یک پروژه وصل کنی تا درصد پیشرفت از وظایف تکمیل‌شده آن پروژه محاسبه شود. از دستیار بخواه موانع و گام بعدی را تحلیل کند.')}
<div class="toolbar"><button class="btn soft" data-action="analyze-goals">✧ تحلیل پیشرفت با AI</button></div><div class="card-grid">${rows.length?rows.map(g=>{const pr=goalProgress(g);return `<article class="entity-card"><div class="entity-top"><div class="entity-mark">⚑</div><div class="entity-title-wrap"><div class="entity-title">${esc(g.title)}</div><div class="task-sub">${g.deadline?'مهلت: '+shortDate(g.deadline):'بدون موعد'}</div></div>${urgencyBadge(g.urgency)}</div><p class="entity-desc">${esc(g.description||'')}</p><div class="progress-label"><span>${g.current!==undefined?`${num(g.current)} / ${num(g.target)} ${esc(g.unit||'')}`:'پیشرفت'}</span><b>${num(pr)}٪</b></div><div class="progress"><i style="width:${pr}%"></i></div><div class="entity-foot"><span class="badge ${g.status==='completed'?'low':'primary'}">${esc(LABELS[g.status]||'در مسیر')}</span><div class="card-actions"><button class="icon-mini" data-action="edit" data-section="goals" data-id="${g.id}">✎</button><button class="icon-mini" data-action="archive" data-section="goals" data-id="${g.id}">⌫</button></div></div></article>`}).join(''):empty('هدفی ثبت نشده','یک نتیجه روشن تعریف کن و پیشرفت آن را به‌صورت مستمر بررسی کن.','⚑')}</div>`;}
function accountBalance(account){const rows=alive('transactions').filter(t=>t.account_id===account.id);return rows.reduce((sum,t)=>sum+(t.type==='income'?1:-1)*Number(t.amount||0),Number(account.openingBalance||0));}
function renderFinance(){const tx=alive('transactions').sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at));const now=new Date();const month=tx.filter(t=>{const d=parseDate(t.date);return d&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();});const accounts=alive('accounts');return `${heading('حسابداری شخصی','درآمد، هزینه، حساب‌ها و جریان نقدی شخصی را به‌صورت محلی ثبت و بررسی کن.','<button class="btn primary" data-action="add" data-section="transactions">＋ ثبت تراکنش</button>')}
${guide('ثبت دقیق و ساده','ابتدا حساب‌های خود را تعریف کن؛ سپس هر درآمد یا هزینه را با مبلغ، تاریخ شمسی، دسته‌بندی و حساب مربوط ثبت کن. موجودی حساب‌ها از مانده اولیه و تراکنش‌ها محاسبه می‌شود. این ابزار دفتر ثبت شخصی است و به بانک یا حساب بانکی متصل نیست.')}
<div class="finance-summary"><div class="metric-card income"><small>درآمد این ماه</small><strong>${totalsByCurrency(month,'income')}</strong></div><div class="metric-card expense"><small>هزینه این ماه</small><strong>${totalsByCurrency(month,'expense')}</strong></div><div class="metric-card"><small>خالص این ماه</small><strong>${netByCurrency(month)}</strong></div></div>
<div class="panel-card" style="margin-bottom:13px"><div class="panel-head"><div><h2>حساب‌های من</h2><p>مانده حساب از روی تراکنش‌های ثبت‌شده محاسبه می‌شود.</p></div><button class="btn small" data-action="add" data-section="accounts">＋ حساب جدید</button></div><div class="card-grid">${accounts.length?accounts.map(a=>`<div class="account-card"><small>${esc(LABELS[a.type]||a.type||'حساب')}</small><strong>${money(accountBalance(a),a.currency||'IRR')}</strong><div class="statline"><span class="tiny">${esc(a.title)}</span><button class="icon-mini" data-action="edit" data-section="accounts" data-id="${a.id}">✎</button></div></div>`).join(''):empty('حسابی تعریف نشده','یک حساب نقدی، بانکی یا کیف پول اضافه کن.','◈')}</div></div>
<div class="panel-card"><div class="panel-head"><div><h2>تراکنش‌ها</h2><p>تاریخچه درآمد و هزینه</p></div><span class="badge">${num(tx.length)} تراکنش</span></div>${tx.length?`<div class="data-table-wrap"><table><thead><tr><th>شرح</th><th>تاریخ</th><th>دسته</th><th>حساب</th><th>مبلغ</th><th>عملیات</th></tr></thead><tbody>${tx.slice(0,60).map(t=>`<tr><td>${esc(t.title)}</td><td>${shortDate(t.date)}</td><td>${esc(t.category||'سایر')}</td><td>${esc(byId('accounts',t.account_id)?.title||'—')}</td><td class="amount ${t.type}">${t.type==='income'?'+':'−'} ${money(t.amount,byId('accounts',t.account_id)?.currency||'IRR')}</td><td><button class="icon-mini" data-action="edit" data-section="transactions" data-id="${t.id}">✎</button><button class="icon-mini" data-action="archive" data-section="transactions" data-id="${t.id}">⌫</button></td></tr>`).join('')}</tbody></table></div>`:empty('تراکنشی ثبت نشده','با ثبت اولین درآمد یا هزینه، گزارش ماهانه ساخته می‌شود.','◈')}</div>`;}
function renderHabits(){const habits=alive('habits');const today=localDateKey();const weekKeys=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return localDateKey(d);});return `${heading('ردیاب عادت','یک ابزار ساده برای ساخت عادت‌های پایدار؛ در نسخه فعلی این بخش عمداً کم‌اولویت و سبک نگه داشته شده است.','<button class="btn primary" data-action="add" data-section="habits">＋ عادت جدید</button>')}
${guide('روش پیشنهادی','عادت را کوچک و مشخص تعریف کن؛ مثلاً «۱۰ دقیقه مطالعه». تعداد روزهای مدنظر در هفته را تعیین کن و هر روز پس از انجام، آن را علامت بزن. نوار پیشرفت، انجام عادت در هفت روز اخیر را نسبت به هدف هفتگی نشان می‌دهد.')}
<div class="list-plain">${habits.length?habits.map(h=>{const logs=alive('habitLogs').filter(l=>l.habit_id===h.id&&weekKeys.includes(l.date)&&l.done);const done=logs.some(l=>l.date===today);const target=Math.max(1,Math.min(7,Number(h.targetDays||7)));const pct=Math.min(100,Math.round(logs.length/target*100));return `<div class="task-row"><button class="task-check ${done?'done':''}" data-action="toggle-habit" data-id="${h.id}">${done?'✓':''}</button><div class="task-main"><div class="task-title">${esc(h.title)}</div><div class="task-sub">${esc(h.description||'')} · ${num(logs.length)} از ${num(target)} روز هدف در ۷ روز اخیر</div><div class="progress" style="margin-top:7px"><i style="width:${pct}%"></i></div></div><button class="icon-mini" data-action="edit" data-section="habits" data-id="${h.id}">✎</button></div>`}).join(''):empty('عادتی تعریف نشده','یک عادت کوچک و قابل تکرار انتخاب کن.','✳')}</div>`;}
function renderMood(){const rows=alive('moods').sort((a,b)=>String(b.date).localeCompare(String(a.date)));const today=localDateKey();const current=rows.find(x=>x.date===today);return `${heading('ردیاب خلق‌وخو','حال کلی و انرژی ذهنی خودت را روزانه ثبت کن تا در طول زمان الگوها را بهتر بشناسی.','')}
${guide('ثبت بدون قضاوت','روزانه یک حالت نزدیک به تجربه واقعی خود انتخاب کن و در صورت تمایل یک یادداشت کوتاه بنویس. این ثبت برای خودشناسی و مشاهده روندهاست و ابزار تشخیص یا درمان پزشکی نیست.')}
<div class="panel-card" style="margin-bottom:13px"><div class="panel-head"><div><h2>امروز چه حالی داری؟</h2><p>${Jalali.format(new Date(),true)}</p></div>${current?'<span class="badge low">ثبت امروز</span>':''}</div><div class="mood-options">${MOODS.map(m=>`<button class="mood-choice ${current?.mood===m.id?'selected':''}" data-action="set-mood" data-mood="${m.id}"><span class="face">${m.face}</span><strong>${m.label}</strong></button>`).join('')}</div><div class="field" style="margin-top:14px"><label>یادداشت کوتاه (اختیاری)</label><textarea class="textarea" id="moodNote" placeholder="چه چیزی روی حال امروزت تأثیر گذاشته؟">${esc(current?.note||'')}</textarea></div><div class="statline"><small class="muted tiny">می‌توانی ثبت امروز را هر زمان ویرایش کنی.</small><button class="btn primary small" data-action="save-mood">ذخیره وضعیت امروز</button></div></div>
<div class="panel-card"><div class="panel-head"><div><h2>تاریخچه خلق‌وخو</h2><p>ثبت‌های گذشته</p></div><span class="badge">${num(rows.length)} روز</span></div><div class="list-plain">${rows.slice(0,30).map(m=>`<div class="person-row"><span style="font-size:23px">${MOODS.find(x=>x.id===m.mood)?.face||'😐'}</span><div class="person-main"><strong>${esc(MOODS.find(x=>x.id===m.mood)?.label||m.mood)} · ${shortDate(m.date)}</strong><small>${esc(m.note||'بدون یادداشت')}</small></div></div>`).join('')||empty('هنوز ثبت روزانه‌ای وجود ندارد','از امروز ثبت را شروع کن.','☻')}</div></div>`;}
function renderMethods(){const method=state.settings.productivityMethod||'kanban';return `${heading('روش‌های بهره‌وری','یک روش متناسب با نوع کار انتخاب کن. تغییر روش فقط نمای سازمان‌دهی وظایف را عوض می‌کند و داده‌ها حذف نمی‌شوند.','')}
${guide('کدام روش را انتخاب کنم؟','کانبان برای مشاهده جریان کار، Must / Should / Want برای انتخاب اولویت روزانه و ماتریس آیزنهاور برای تفکیک فوریت از اهمیت مناسب است. می‌توانی هر زمان روش فعال را تغییر بدهی.')}
<div class="method-switch"><button class="method-option ${method==='kanban'?'active':''}" data-action="set-method" data-method="kanban">کانبان</button><button class="method-option ${method==='mustshouldwant'?'active':''}" data-action="set-method" data-method="mustshouldwant">Must / Should / Want</button><button class="method-option ${method==='eisenhower'?'active':''}" data-action="set-method" data-method="eisenhower">ماتریس آیزنهاور</button></div>
<div class="method-card"><h3>۱. کانبان (Kanban)</h3><p>کانبان جریان کار را به ستون‌های قابل مشاهده تقسیم می‌کند. هر کارت یک وظیفه است و با تغییر وضعیت در ستون مناسب قرار می‌گیرد.</p><ul><li><b>برای انجام:</b> کارهایی که هنوز شروع نشده‌اند.</li><li><b>در حال انجام:</b> کارهایی که اکنون روی آن‌ها تمرکز داری.</li><li><b>منتظر:</b> کارهایی که به پاسخ یا اقدام فرد دیگری وابسته‌اند.</li><li><b>تکمیل‌شده:</b> خروجی‌های تمام‌شده.</li></ul><p><b>نحوه استفاده:</b> تعداد کارهای «در حال انجام» را محدود کن؛ مثلاً هم‌زمان بیش از ۲ یا ۳ کار فعال نداشته باش. برای انتقال کارت، وضعیت آن را در فرم ویرایش تغییر بده.</p></div>
<div class="method-card"><h3>۲. Must / Should / Want</h3><p>این روش برای برنامه‌ریزی روزانه مناسب است و به‌جای اینکه همه کارها را مهم جلوه دهد، آن‌ها را به سه گروه واقع‌بینانه تقسیم می‌کند.</p><ul><li><b>Must:</b> کارهای ضروری؛ اگر انجام نشوند پیامد جدی یا موعد ازدست‌رفته دارند.</li><li><b>Should:</b> کارهای باارزش که بهتر است انجام شوند، اما فوریت مطلق ندارند.</li><li><b>Want:</b> کارهای مطلوب یا اختیاری که در صورت داشتن ظرفیت انجام می‌شوند.</li></ul><p><b>نحوه استفاده:</b> ابتدا فقط چند مورد Must انتخاب کن، سپس Shouldها را اضافه کن و Wantها را در ظرفیت باقیمانده قرار بده. در فرم وظیفه، فیلد «جایگاه روزانه» را مشخص کن.</p></div>
<div class="method-card"><h3>۳. ماتریس آیزنهاور (Eisenhower Matrix)</h3><p>این روش بر دو معیار مستقل استوار است: «فوریت» و «اهمیت». فوریت یعنی محدودیت زمانی؛ اهمیت یعنی اثر کار بر اهداف و نتایج بلندمدت.</p><ul><li><b>ربع اول — فوری و مهم:</b> اکنون انجام بده؛ بحران‌ها و موعدهای حیاتی.</li><li><b>ربع دوم — مهم، غیرفوری:</b> زمان‌بندی کن؛ یادگیری، برنامه‌ریزی و پیشگیری.</li><li><b>ربع سوم — فوری، کم‌اهمیت:</b> در صورت امکان واگذار یا ساده‌سازی کن؛ وقفه‌های کم‌ارزش.</li><li><b>ربع چهارم — غیرفوری و کم‌اهمیت:</b> حذف یا محدود کن؛ فعالیت‌های کم‌اثر و وقت‌گیر.</li></ul><p><b>نحوه استفاده:</b> در فرم هر وظیفه ربع مناسب را انتخاب کن. اگر مطمئن نیستی، از خود بپرس: «آیا این کار به هدف مهمی کمک می‌کند؟» و «آیا تأخیر در آن پیامد فوری دارد؟»</p></div>
<div class="panel-card"><div class="statline"><div><h2 style="font-size:12px;margin:0">روش فعال در برنامه</h2><small class="muted tiny">این انتخاب در بخش وظایف نیز اعمال می‌شود.</small></div><span class="badge primary">${method==='kanban'?'کانبان':method==='mustshouldwant'?'Must / Should / Want':'آیزنهاور'}</span></div></div>`;}
function renderAssistant(){const history=state.aiHistory||[];return `${heading('دستیار هوشمند','یک دستیار آگاه به اطلاعات فضای شخصی؛ می‌تواند داده‌ها را بخواند، ثبت کند و به‌روزرسانی کند.','')}
${guide('دسترسی هوشمند به همه بخش‌ها','دستیار می‌تواند پروژه‌ها، وظایف، یادآورها، ایده‌ها، وب‌سایت‌ها، مخاطبین، یادداشت‌ها، اهداف، حساب‌ها، تراکنش‌ها، عادت‌ها و خلق‌وخو را بخواند و با ابزارهای داخلی ایجاد، ویرایش یا بایگانی کند. پیش از درخواست‌های مالی، مبلغ و حساب را دقیق بیان کن.')}
<div class="chat-layout"><section class="chat-box"><div class="chat-messages" id="chatMessages">${history.length?history.slice(-30).map(m=>`<div class="chat-bubble ${m.role==='user'?'user':'assistant'}">${esc(m.content)}</div>`).join(''):empty('گفت‌وگو را شروع کن','مثلاً بپرس: این هفته چه کارهای عقب‌افتاده‌ای دارم؟ یا ایده‌های ثبت‌شده را دسته‌بندی کن.','✧')}</div><div class="chat-compose"><textarea class="textarea" id="chatInput" placeholder="درخواستت را بنویس... (Ctrl + Enter برای ارسال)"></textarea><button class="btn primary" id="chatSend" data-action="chat-send">ارسال ↗</button></div></section>
<aside class="chat-side"><h3>دستیار چه کارهایی می‌تواند بکند؟</h3><p>با اتصال BoxAPI، دستیار می‌تواند تمام بخش‌های SmartDay را بررسی کند و بر اساس دستور تو عملیات ثبت یا ویرایش انجام دهد.</p><button class="prompt-chip" data-prompt="وظایف عقب‌افتاده و مهم من را فهرست کن و برای امروز پیشنهاد بده.">برنامه امروز را تحلیل کن</button><button class="prompt-chip" data-prompt="ایده‌های ثبت‌شده را مرور کن، دسته‌بندی پیشنهادی بده و موارد مشابه را مرتب کن.">ایده‌ها را مرتب کن</button><button class="prompt-chip" data-prompt="پیشرفت اهداف من را بررسی کن و برای هرکدام گام بعدی پیشنهاد بده.">اهدافم را تحلیل کن</button><button class="prompt-chip" data-prompt="هزینه‌های این ماه را بر اساس دسته‌بندی خلاصه کن و موارد قابل بررسی را مشخص کن.">هزینه‌های ماه را بررسی کن</button><div class="divider"></div><small class="muted">برای استفاده آفلاین، تمام امکانات محلی فعال‌اند؛ فقط پاسخ‌گویی AI به اینترنت و کلید BoxAPI نیاز دارد.</small></aside></div>`;}
function renderSettings(){const s=state.settings||{};return `${heading('تنظیمات','ظاهر، رفتار دسکتاپ، اتصال هوش مصنوعی، همگام‌سازی و پشتیبان‌گیری.','')}
${guide('محلی و آفلاین در اولویت','تمام داده‌ها روی همین کامپیوتر ذخیره می‌شوند. اتصال هوش مصنوعی و همگام‌سازی آنلاین اختیاری‌اند. کلیدهای دسترسی با قابلیت رمزنگاری سیستم‌عامل نگهداری می‌شوند.')}
<div class="settings-grid">
<section class="settings-card"><h3>ظاهر برنامه</h3><p>پوسته روشن، تیره یا هماهنگ با تنظیمات ویندوز را انتخاب کن.</p><div class="theme-options"><button class="theme-swatch ${s.theme==='light'?'active':''}" data-action="set-theme" data-theme="light">☀ روشن</button><button class="theme-swatch ${s.theme==='dark'?'active':''}" data-action="set-theme" data-theme="dark">☾ تیره</button><button class="theme-swatch ${(!s.theme||s.theme==='system')?'active':''}" data-action="set-theme" data-theme="system">◐ سیستم</button></div></section>
<section class="settings-card"><h3>رفتار برنامه در ویندوز</h3><p>SmartDay با بستن پنجره به System Tray منتقل می‌شود و بررسی یادآورها ادامه می‌یابد.</p><div class="toggle-row"><span>با بستن پنجره، برنامه در System Tray فعال می‌ماند</span><b class="badge primary">همیشه فعال</b></div><div class="toggle-row"><span>اجرای خودکار هنگام ورود به ویندوز</span><input class="toggle" type="checkbox" id="prefStartup" ${s.startAtLogin?'checked':''}></div><div class="toggle-row"><span>نمای سریع شناور دسکتاپ</span><input class="toggle" type="checkbox" id="prefWidget" ${s.widgetEnabled?'checked':''}></div><div class="toggle-row"><span>صدای اعلان‌ها</span><input class="toggle" type="checkbox" id="prefSound" ${s.reminderSound!==false?'checked':''}></div></section>
<section class="settings-card"><h3>اتصال هوش مصنوعی BoxAPI</h3><p>کلید API در فضای رمزنگاری‌شده سیستم‌عامل نگهداری می‌شود و وارد فایل پشتیبان نمی‌شود.</p><div class="field"><label>آدرس پایه API</label><input class="input ltr" id="apiBaseUrl" value="${esc(s.apiBaseUrl||'https://ai.boxapi.ir/ai/v1')}"></div><div class="field"><label>کلید API ${s.hasApiKey?'— ثبت شده':''}</label><input class="input ltr" id="apiKey" type="password" placeholder="${s.hasApiKey?'برای جایگزینی کلید جدید وارد کن':'کلید BoxAPI'}" autocomplete="off"></div><div class="field"><label>مدل</label><div class="inline-form"><select class="select" id="aiModel"><option value="${esc(s.model||'')}">${esc(s.model||'ابتدا مدل‌ها را دریافت کن')}</option></select><button class="btn small" data-action="load-models">دریافت مدل‌ها</button></div></div><div class="inline-form"><button class="btn primary small" data-action="save-ai">ذخیره تنظیمات AI</button><button class="btn small" data-action="test-ai">آزمایش اتصال</button></div><small class="field-hint">مقدار پیش‌فرض سرویس: https://ai.boxapi.ir/ai/v1</small></section>
<section class="settings-card"><h3>همگام‌سازی با نسخه آنلاین</h3><p>برای همگام‌سازی، نسخه وب باید endpoint همگام‌سازی SmartDay 2 را نصب کرده باشد. پروتکل ادغام رکوردها بر اساس شناسه و آخرین ویرایش است.</p><div class="toggle-row"><span>فعال‌سازی همگام‌سازی</span><input class="toggle" type="checkbox" id="syncEnabled" ${s.syncEnabled?'checked':''}></div><div class="field"><label>آدرس کامل sync.php</label><input class="input ltr" id="syncUrl" value="${esc(s.syncUrl||'')}" placeholder="https://example.com/smartday/sync.php"></div><div class="field"><label>توکن همگام‌سازی</label><input class="input ltr" id="syncToken" type="password" placeholder="${s.hasSyncToken?'توکن قبلی ثبت شده؛ برای جایگزینی وارد کن':'توکن امن سرور'}"></div><div class="inline-form"><button class="btn primary small" data-action="save-sync">ذخیره اتصال</button><button class="btn small" data-action="sync-now">همگام‌سازی اکنون</button></div><small class="field-hint">آخرین همگام‌سازی: ${s.lastSyncAt?esc(new Date(s.lastSyncAt).toLocaleString('fa-IR')):'هنوز انجام نشده'}</small></section>
<section class="settings-card"><h3>داده‌ها و پشتیبان‌گیری</h3><p>اطلاعات اصلی به‌صورت محلی در پوشه کاربر ویندوز ذخیره می‌شوند. پیش از نصب مجدد یا انتقال دستگاه، پشتیبان تهیه کن.</p><div class="field"><label>مسیر داده محلی</label><div class="input ltr" style="overflow-wrap:anywhere">${esc(s.dataPath||'مسیر محلی برنامه')}</div></div><div class="inline-form"><button class="btn primary small" data-action="backup-export">⇩ دریافت پشتیبان</button><button class="btn small" data-action="backup-import">⇧ بازیابی پشتیبان</button></div><div class="divider"></div><small class="field-hint">پشتیبان شامل اطلاعات ماژول‌ها و تنظیمات غیرمحرمانه است؛ کلید AI و توکن همگام‌سازی در آن قرار نمی‌گیرند.</small></section>
<section class="settings-card"><h3>روش پیش‌فرض مدیریت وظایف</h3><p>نمای پیش‌فرض بخش وظایف را انتخاب کن. در صفحه وظایف امکان تغییر فوری روش وجود دارد.</p><div class="field"><select class="select" id="defaultMethod"><option value="kanban" ${s.productivityMethod==='kanban'?'selected':''}>کانبان</option><option value="mustshouldwant" ${s.productivityMethod==='mustshouldwant'?'selected':''}>Must / Should / Want</option><option value="eisenhower" ${s.productivityMethod==='eisenhower'?'selected':''}>ماتریس آیزنهاور</option></select></div><button class="btn small" data-action="save-method">ذخیره روش پیش‌فرض</button></section>
</div>`;}
function renderCalendar(){
  const {year,month}=calendarCursor;const first=Jalali.toGregorian(year,month,1);const offset=Jalali.weekday(first);const days=Jalali.monthDays(year,month);const selectedKey=localDateKey(selectedCalendarDate);const week=['ش','ی','د','س','چ','پ','ج'];let cells='';
  for(let i=0;i<offset;i++)cells+='<div class="calendar-day muted"></div>';
  for(let d=1;d<=days;d++){const date=Jalali.toGregorian(year,month,d);const key=localDateKey(date);const isCurrent=Jalali.parts(new Date()).year===year&&Jalali.parts(new Date()).month===month&&Jalali.parts(new Date()).day===d;const count=alive('tasks').filter(t=>t.due_at&&new Date(t.due_at).toDateString()===date.toDateString()).length;const rem=alive('reminders').filter(r=>r.remind_at&&new Date(r.remind_at).toDateString()===date.toDateString()).length;const evt=alive('events').filter(e=>e.start_at&&new Date(e.start_at).toDateString()===date.toDateString()).length;cells+=`<button class="calendar-day ${isCurrent?'today':''} ${key===selectedKey?'selected':''}" data-action="calendar-select" data-date="${key}"><span class="num">${digits(d)}</span><div class="dots">${count?'<i class="task"></i>':''}${rem?'<i class="rem"></i>':''}${evt?'<i class="event"></i>':''}</div></button>`;}
  const selectedEvents=[...alive('tasks').filter(t=>t.due_at&&new Date(t.due_at).toDateString()===selectedCalendarDate.toDateString()).map(t=>({title:t.title,type:'وظیفه',time:t.due_at})),...alive('reminders').filter(t=>t.remind_at&&new Date(t.remind_at).toDateString()===selectedCalendarDate.toDateString()).map(t=>({title:t.title,type:t.category==='work'?'یادآور کاری':'یادآور شخصی',time:t.remind_at})),...alive('events').filter(t=>t.start_at&&new Date(t.start_at).toDateString()===selectedCalendarDate.toDateString()).map(t=>({title:t.title,type:'رویداد',time:t.start_at}))].sort((a,b)=>new Date(a.time)-new Date(b.time));
  return `${heading('تقویم شمسی','برنامه وظایف، یادآورها و رویدادها را در تقویم ماهانه ببین و برای روز انتخاب‌شده مورد جدید ثبت کن.','<button class="btn primary" data-action="add" data-section="events">＋ رویداد جدید</button>')}
  ${guide('تقویم یکپارچه','نقطه آبی نشان‌دهنده وظیفه، صورتی یادآور و سبز رویداد است. روی هر روز بزن تا برنامه همان روز در ستون کناری نمایش داده شود. تاریخ تمام فرم‌های جدید با تقویم شمسی وارد می‌شود.')}
  <div class="calendar-layout"><section class="calendar-card"><div class="calendar-head"><div class="arrows"><button class="icon-mini" data-action="calendar-prev">→</button><button class="icon-mini" data-action="calendar-next">←</button></div><strong>${Jalali.monthName(year,month)}</strong><button class="btn small" data-action="calendar-today">امروز</button></div><div class="calendar-grid">${week.map(w=>`<div class="weekday">${w}</div>`).join('')}${cells}</div></section>
  <section class="calendar-card"><div class="calendar-head"><strong>برنامه ${Jalali.format(selectedCalendarDate,true)}</strong><button class="btn small" data-action="add" data-section="tasks" data-date="${selectedKey}">＋ وظیفه</button></div><div class="calendar-side-list">${selectedEvents.length?selectedEvents.map(e=>`<div class="calendar-event"><i></i><div><strong>${esc(e.title)}</strong><small>${esc(e.type)} · ${dateTimeLabel(e.time)}</small></div></div>`).join(''):empty('برنامه‌ای ثبت نشده','برای این روز می‌توانی وظیفه یا رویداد ثبت کنی.','▣')}</div><div class="divider"></div><button class="btn small" data-action="add" data-section="reminders" data-date="${selectedKey}">＋ یادآور برای این روز</button></section></div>`;
}

const urgencyOptions=[['none','بدون فوریت'],['low','کم'],['medium','متوسط'],['high','زیاد'],['critical','بحرانی']];
const priorityOptions=[['low','کم'],['medium','متوسط'],['high','زیاد'],['urgent','بسیار مهم']];
const FORM_FIELDS={
  projectItems:[['title','عنوان امر / موضوع','text',true],['description','توضیحات و پیگیری','textarea'],['project_id','پروژه مرتبط','select','projects'],['status','وضعیت','select',[['todo','برای انجام'],['doing','در حال پیگیری'],['waiting','منتظر'],['done','تکمیل‌شده']]],['urgency','فوریت','select',urgencyOptions],['due_at','مهلت پیگیری','date']],
  projects:[['title','عنوان پروژه','text',true],['description','توضیحات','textarea'],['status','وضعیت','select',[['active','فعال'],['paused','متوقف'],['completed','تکمیل‌شده']]],['urgency','فوریت','select',urgencyOptions],['deadline','مهلت پروژه','date']],
  tasks:[['title','عنوان وظیفه','text',true],['description','شرح و جزئیات','textarea'],['project_id','پروژه مرتبط','select','projects'],['status','وضعیت','select',[['inbox','صندوق ورودی'],['todo','برای انجام'],['doing','در حال انجام'],['waiting','منتظر'],['done','تکمیل‌شده'],['cancelled','لغوشده']]],['priority','اهمیت','select',priorityOptions],['urgency','فوریت','select',urgencyOptions],['due_at','موعد انجام','datetime'],['planning_bucket','جایگاه روزانه','select',[['must','Must — باید انجام شود'],['should','Should — بهتر است انجام شود'],['want','Want — در صورت امکان']]],['eisenhower','خانه ماتریس آیزنهاور','select',[['q1','فوری و مهم'],['q2','مهم، غیرفوری'],['q3','فوری، کم‌اهمیت'],['q4','غیرفوری و کم‌اهمیت']]],['estimated_minutes','زمان تخمینی (دقیقه)','number']],
  notes:[['title','عنوان یادداشت','text',true],['content','متن یادداشت','textarea',true],['project_id','اتصال به پروژه','select','projects'],['urgency','فوریت پیگیری','select',urgencyOptions]],
  reminders:[['title','عنوان یادآور','text',true],['description','توضیحات','textarea'],['category','نوع یادآور','select',[['personal','امور شخصی'],['work','امور کاری']]],['remind_at','تاریخ و ساعت یادآوری','datetime',true],['repeat','تکرار','select',[['none','بدون تکرار'],['daily','روزانه'],['weekly','هفتگی'],['monthly','ماهانه']]],['urgency','فوریت','select',urgencyOptions]],
  ideas:[['title','عنوان ایده','text',true],['content','شرح و جزئیات ایده','textarea'],['category','دسته‌بندی','text'],['status','مرحله','select',[['captured','ایده تازه'],['sorting','در حال بررسی'],['ready','آماده اقدام'],['archived','بایگانی']]],['urgency','فوریت بررسی','select',urgencyOptions],['tags','برچسب‌ها (با ویرگول جدا کن)','text']],
  websites:[['url','آدرس وب‌سایت','url',true],['title','عنوان','text'],['description','توضیحات متا / کاربرد','textarea'],['category','دسته‌بندی','text'],['urgency','فوریت بررسی','select',urgencyOptions]],
  contacts:[['name','نام مخاطب','text',true],['phone','شماره تماس','tel'],['email','ایمیل','email'],['organization','سازمان / شرکت','text'],['relation','نوع ارتباط','text'],['notes','یادداشت','textarea'],['urgency','فوریت پیگیری','select',urgencyOptions]],
  goals:[['title','عنوان هدف','text',true],['description','شرح هدف','textarea'],['target','مقدار هدف','number'],['current','مقدار فعلی','number'],['unit','واحد اندازه‌گیری','text'],['project_id','پروژه مرتبط (محاسبه پیشرفت از پروژه)','select','projects'],['deadline','مهلت هدف','date'],['status','وضعیت','select',[['active','در مسیر'],['paused','متوقف'],['completed','تکمیل‌شده']]],['urgency','فوریت','select',urgencyOptions]],
  accounts:[['title','نام حساب','text',true],['type','نوع حساب','select',[['cash','نقدی'],['bank','بانکی'],['wallet','کیف پول'],['other','سایر']]],['openingBalance','مانده اولیه (تومان)','number'],['currency','واحد پول','select',[['IRR','تومان'],['USD','دلار'],['EUR','یورو']]]],
  transactions:[['title','شرح تراکنش','text',true],['type','نوع تراکنش','select',[['expense','هزینه'],['income','درآمد']]],['amount','مبلغ (بر اساس واحد حساب انتخاب‌شده)','number',true],['date','تاریخ تراکنش','date',true],['account_id','حساب','select','accounts'],['category','دسته‌بندی','text'],['notes','توضیحات','textarea'],['urgency','فوریت پیگیری','select',urgencyOptions]],
  habits:[['title','نام عادت','text',true],['description','توضیحات','textarea'],['frequency','تناوب','select',[['daily','روزانه'],['weekdays','روزهای کاری'],['custom','سفارشی']]],['targetDays','هدف در هفته (روز)','number'],['urgency','فوریت','select',urgencyOptions]],
  events:[['title','عنوان رویداد','text',true],['description','توضیحات','textarea'],['start_at','تاریخ و ساعت','datetime',true],['urgency','فوریت','select',urgencyOptions]]
};
function fieldHtml(def,value){const [name,label,type,extra]=def;const required=extra===true;const id='f_'+name;let html='';
  if(type==='textarea')html=`<textarea class="textarea" name="${name}" id="${id}" ${required?'required':''}>${esc(value??'')}</textarea>`;
  else if(type==='select'){
    let opts=[];if(extra==='projects')opts=alive('projects').map(p=>[p.id,p.title]);else if(extra==='accounts')opts=alive('accounts').map(a=>[a.id,a.title]);else opts=extra||[];
    html=`<select class="select" name="${name}" id="${id}"><option value="">${name==='project_id'?'بدون اتصال به پروژه':name==='account_id'?'انتخاب حساب':'انتخاب کن'}</option>${opts.map(([v,t])=>`<option value="${esc(v)}" ${String(value??'')===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
  } else if(type==='date'||type==='datetime'){
    const dateVal=value?new Date(value):null;const dateText=dateVal?Jalali.format(dateVal):(required?Jalali.format(new Date()):'');const timeText=dateVal?`${String(dateVal.getHours()).padStart(2,'0')}:${String(dateVal.getMinutes()).padStart(2,'0')}`:'09:00';
    html=`<div class="date-field"><input class="input jalali-input" name="${name}_jalali" id="${id}" value="${dateText}" placeholder="۱۴۰۵/۰۹/۰۶" autocomplete="off" ${required?'required':''}><button class="btn small" type="button" data-action="open-date" data-target="${id}">▣</button></div><div class="date-pop hidden" id="${id}_picker"></div>${type==='datetime'?`<input class="input" style="margin-top:6px;width:120px" type="time" name="${name}_time" value="${timeText}">`:''}`;
  } else {
    const inputType=type==='number'?'number':type;const step=type==='number'?'step="any" min="0"':'';
    html=`<input class="input ${type==='url'||type==='tel'||type==='email'?'ltr':''}" type="${inputType}" name="${name}" id="${id}" value="${esc(value??'')}" ${required?'required':''} ${step}>`;
  }
  let inspect='';if(name==='url')inspect='<button class="btn small" type="button" data-action="inspect-website">استخراج عنوان و توضیحات از صفحه</button><small id="websiteInspectResult" class="field-hint"></small>';
  return `<div class="field ${type==='textarea'?'full':''}"><label for="${id}">${esc(label)}${required?'<em>*</em>':''}</label>${html}${inspect}</div>`;
}
function openForm(section,id=null,extra={}){
  if(section==='moods')return;
  if(!FORM_FIELDS[section])return;
  const existing=id?byId(section,id):null;
  const title=existing?`ویرایش ${sectionLabel(section)}`:`افزودن ${sectionLabel(section)}`;
  const values={...(existing||{})};
  if(extra.projectId)values.project_id=extra.projectId;
  if(extra.date){if(section==='tasks')values.due_at=extra.date+'T09:00:00';if(section==='reminders')values.remind_at=extra.date+'T09:00:00';if(section==='events')values.start_at=extra.date+'T09:00:00';if(section==='transactions')values.date=extra.date;}
  const fields=FORM_FIELDS[section].map(f=>fieldHtml(f,values[f[0]])).join('');
  const note=section==='reminders'?'<div class="field-hint full">یادآور شخصی و کاری در دو فهرست مستقل دیده می‌شوند؛ در ویندوز اعلان بومی دریافت می‌کنی.</div>':section==='tasks'?'<div class="field-hint full">فوریت نشان‌دهنده فشار زمانی است؛ اهمیت و جایگاه روزانه را جداگانه انتخاب کن.</div>':'';
  showModal(`<div class="modal ${section==='notes'?'wide':''}"><div class="modal-head"><div><h2>${title}</h2><p>فیلدهای لازم را تکمیل و ذخیره کن. تاریخ‌ها با تقویم شمسی ثبت می‌شوند.</p></div><button class="modal-close" data-action="modal-close">×</button></div><form id="recordForm" data-section="${section}" data-id="${id||''}"><div class="form-grid">${fields}${note}</div><div class="modal-actions"><button class="btn primary" type="submit">ذخیره</button><button class="btn" type="button" data-action="modal-close">انصراف</button>${existing?`<button class="btn danger" type="button" data-action="archive" data-section="${section}" data-id="${id}">بایگانی</button>`:''}</div></form></div>`);
}
function sectionLabel(section){return {projects:'پروژه',tasks:'وظیفه',notes:'یادداشت',reminders:'یادآور',ideas:'ایده',websites:'وب‌سایت',contacts:'مخاطب',goals:'هدف',accounts:'حساب',transactions:'تراکنش',habits:'عادت',events:'رویداد'}[section]||'مورد';}
function showModal(html){const root=$('#modalRoot');root.innerHTML=html;root.classList.add('open');root.setAttribute('aria-hidden','false');}
function closeModal(){const root=$('#modalRoot');root.classList.remove('open');root.setAttribute('aria-hidden','true');root.innerHTML='';datePickerTarget=null;}
function getFormRecord(form){const fd=new FormData(form);const section=form.dataset.section;const obj={};for(const [key,value] of fd.entries()){
  if(key.endsWith('_jalali')||key.endsWith('_time'))continue;
  if(key==='description'||key==='content'||key==='notes')obj[key]=String(value).trim();
  else if(['estimated_minutes','target','current','amount','openingBalance','targetDays'].includes(key))obj[key]=Number(value||0);
  else obj[key]=String(value).trim();
}
  for(const def of FORM_FIELDS[section]){const [name,label,type]=def;if(type==='date'||type==='datetime'){
    const raw=fd.get(name+'_jalali');const time=fd.get(name+'_time')||'09:00';if(raw){const g=Jalali.parse(raw);obj[name]=new Date(`${g}T${time}:00`).toISOString();}else obj[name]=null;
  }}
  if(section==='ideas'){obj.tags=String(fd.get('tags')||'').split(/[,،]/).map(x=>x.trim()).filter(Boolean);obj.status=obj.status||'captured';}
  if(section==='tasks'){obj.status=obj.status||'todo';obj.priority=obj.priority||'medium';obj.urgency=obj.urgency||'medium';obj.planning_bucket=obj.planning_bucket||'should';obj.eisenhower=obj.eisenhower||'q2';}
  if(section==='projectItems'){obj.status=obj.status||'todo';obj.urgency=obj.urgency||'medium';}
  if(section==='projects')obj.status=obj.status||'active';
  if(section==='reminders'){obj.active=true;obj.category=obj.category||'personal';obj.repeat=obj.repeat||'none';obj.urgency=obj.urgency||'medium';}
  if(section==='habits'){obj.active=true;obj.frequency=obj.frequency||'daily';obj.targetDays=obj.targetDays||7;}
  if(section==='accounts'){obj.currency=obj.currency||'IRR';obj.type=obj.type||'cash';}
  if(section==='transactions'){obj.type=obj.type||'expense';obj.urgency=obj.urgency||'medium';}
  if(section==='contacts'||section==='websites'||section==='goals'||section==='notes')obj.urgency=obj.urgency||'medium';
  return obj;
}
async function saveRecord(form){
  const section=form.dataset.section,id=form.dataset.id;let record=getFormRecord(form);const now=isoNow();
  if(section==='contacts'&&!record.name)throw new Error('نام مخاطب الزامی است.');
  if(section==='websites'){
    try{const u=new URL(record.url);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch(_){throw new Error('آدرس وب‌سایت معتبر نیست.');}
  }
  let savedId=id;
  if(id){const idx=state[section].findIndex(x=>x.id===id);if(idx<0)throw new Error('مورد برای ویرایش پیدا نشد.');state[section][idx]={...state[section][idx],...record,updated_at:now};}
  else {savedId=uid(section);state[section].push({id:savedId,...record,created_at:now,updated_at:now});}
  await persist();closeModal();
  if(section==='projects'&&currentPage==='projects')setPage('projects');else if((section==='tasks'||section==='projectItems'||section==='notes')&&currentPage==='project-detail')setProjectPage(currentProjectId);else setPage(currentPage);
  toast(`${sectionLabel(section)} ذخیره شد.`);
  if(section==='websites'&&!id&&state.settings.model&&state.settings.hasApiKey){const site=byId('websites',savedId);if(site)setTimeout(()=>categorizeWebsite(savedId),250);}
}
function setProjectPage(id){currentPage='project-detail';currentProjectId=id;$('#pageTitle').textContent='جزئیات پروژه';$('#pageRoot').innerHTML=renderProjectDetail();}
async function archiveItem(section,id){if(!confirm('این مورد به بایگانی منتقل شود؟'))return;const item=state[section]?.find(x=>x.id===id);if(!item)return;item._deleted_at=isoNow();item.updated_at=isoNow();await persist();closeModal();if(currentPage==='project-detail')setProjectPage(currentProjectId);else setPage(currentPage);toast('مورد به بایگانی منتقل شد.');}
async function completeTask(id){const t=state.tasks.find(x=>x.id===id);if(!t)return;t.status=t.status==='done'?'todo':'done';t.completed_at=t.status==='done'?isoNow():null;t.updated_at=isoNow();await persist();setPage(currentPage);}
async function completeReminder(id){const r=state.reminders.find(x=>x.id===id);if(!r)return;r.active=false;r.completed_at=isoNow();r.updated_at=isoNow();await persist();setPage(currentPage);toast('یادآور تکمیل شد.');}
async function snoozeReminder(id){const r=state.reminders.find(x=>x.id===id);if(!r)return;r.remind_at=new Date(Date.now()+10*60000).toISOString();r.last_notified_at=null;r.updated_at=isoNow();await persist();setPage(currentPage);toast('یادآور ۱۰ دقیقه به تعویق افتاد.');}
function openDatePicker(target){datePickerTarget=target;const inp=$('#'+target);let p;try{const parsed=Jalali.parse(inp.value||Jalali.format(new Date()));p=Jalali.parts(new Date(parsed+'T12:00:00'));}catch(_){p=Jalali.parts(new Date());}pickerCursor={year:p.year,month:p.month};renderDatePicker();}
function renderDatePicker(){const target=$('#'+datePickerTarget+'_picker');if(!target)return;const {year,month}=pickerCursor;const first=Jalali.toGregorian(year,month,1);const offset=Jalali.weekday(first);const days=Jalali.monthDays(year,month);let grid='';['ش','ی','د','س','چ','پ','ج'].forEach(x=>grid+=`<span>${x}</span>`);for(let i=0;i<offset;i++)grid+='<span></span>';for(let d=1;d<=days;d++){const active=$('#'+datePickerTarget)?.value===`${digits(year)}/${digits(String(month).padStart(2,'0'))}/${digits(String(d).padStart(2,'0'))}`;grid+=`<button type="button" class="${active?'sel':''}" data-action="choose-date" data-day="${d}">${digits(d)}</button>`;}target.classList.remove('hidden');target.innerHTML=`<div class="date-pop-head"><button class="icon-mini" type="button" data-action="picker-prev">›</button><strong>${Jalali.monthName(year,month)}</strong><button class="icon-mini" type="button" data-action="picker-next">‹</button></div><div class="date-pop-grid">${grid}</div><div class="statline" style="margin-top:8px"><button class="text-btn" type="button" data-action="picker-today">امروز</button><button class="text-btn" type="button" data-action="picker-close">بستن</button></div>`;}
function dateInputSet(day){const d=Jalali.toGregorian(pickerCursor.year,pickerCursor.month,day);$('#'+datePickerTarget).value=Jalali.format(d);$('#'+datePickerTarget+'_picker').classList.add('hidden');}
function shiftJalaliMonth(year,month,delta){let m=month+delta,y=year;if(m>12){m=1;y++;}if(m<1){m=12;y--;}return {year:y,month:m};}

async function loadModels(){try{toast('در حال دریافت فهرست مدل‌ها...');const models=await window.smartday.listModels();const select=$('#aiModel');select.innerHTML=models.map(m=>`<option value="${esc(m.id)}" ${m.id===state.settings.model?'selected':''}>${esc(m.name||m.id)} (${esc(m.id)})</option>`).join('')||'<option value="">مدلی پیدا نشد</option>';toast(`${num(models.length)} مدل دریافت شد.`);}catch(e){toast(e.message,true);}}
async function saveAI(){const apiBaseUrl=$('#apiBaseUrl').value.trim();const model=$('#aiModel').value;await window.smartday.savePreferences({apiBaseUrl,model});const apiKey=$('#apiKey').value.trim();if(apiKey)await window.smartday.setCredentials({apiKey});state=await window.smartday.getState();setPage('settings');toast('تنظیمات هوش مصنوعی ذخیره شد.');}
async function saveSync(){const syncEnabled=$('#syncEnabled').checked;const syncUrl=$('#syncUrl').value.trim();await window.smartday.savePreferences({syncEnabled,syncUrl});const syncToken=$('#syncToken').value.trim();if(syncToken)await window.smartday.setCredentials({syncToken});state=await window.smartday.getState();setPage('settings');toast('تنظیمات همگام‌سازی ذخیره شد.');}
async function sendAI(message){if(chatBusy)return;if(!message.trim())return;if(!state.settings.model||!state.settings.hasApiKey){toast('ابتدا اتصال BoxAPI را در تنظیمات تکمیل کن.',true);return;}
  chatBusy=true;const history=[...(state.aiHistory||[])];history.push({role:'user',content:message,at:isoNow()});if(currentPage==='assistant')renderChatMessages();
  try{const result=await window.smartday.chat(message,history.slice(0,-1).slice(-12));
    // AI tools run in the main process and update the local store; reload before saving chat history so stale renderer state cannot overwrite those actions.
    state=await window.smartday.getState();history.push({role:'assistant',content:result.text,actions:result.actions||[],at:isoNow()});state.aiHistory=history.slice(-40);await persist();if(currentPage==='assistant')renderChatMessages();toast(result.actions?.length?`${num(result.actions.filter(a=>a.ok).length)} عملیات اجرا شد.`:'پاسخ دستیار دریافت شد.');}
  catch(e){state=await window.smartday.getState();history.push({role:'assistant',content:'خطا در ارتباط با هوش مصنوعی: '+e.message,at:isoNow(),error:true});state.aiHistory=history.slice(-40);await persist();if(currentPage==='assistant')renderChatMessages();toast(e.message,true);}
  finally{chatBusy=false;const b=$('#chatSend');if(b)b.disabled=false;}
}
function renderChatMessages(){const node=$('#chatMessages');if(!node)return;const history=state.aiHistory||[];node.innerHTML=history.slice(-30).map(m=>`<div class="chat-bubble ${m.role==='user'?'user':'assistant'}">${esc(m.content)}${m.actions?.length?`<div class="tiny" style="margin-top:6px;opacity:.7">${num(m.actions.filter(x=>x.ok).length)} اقدام موفق</div>`:''}</div>`).join('')||empty('گفت‌وگو را شروع کن','از دستیار درباره برنامه یا اطلاعاتت سؤال کن.','✧');node.scrollTop=node.scrollHeight;}
async function inspectWebsiteFromForm(){const url=$('#f_url')?.value.trim();if(!url)throw new Error('ابتدا آدرس وب‌سایت را وارد کن.');const label=$('#websiteInspectResult');label.textContent='در حال دریافت عنوان و توضیحات صفحه...';try{const info=await window.smartday.inspectWebsite(url);if($('#f_title'))$('#f_title').value=info.title;if($('#f_description'))$('#f_description').value=info.description;label.textContent=`عنوان و توضیحات دریافت شد · ${info.siteName||new URL(info.url).hostname}`;}catch(e){label.textContent=e.message;throw e;}}
async function categorizeWebsite(id){const w=byId('websites',id);if(!w)return;await sendAI(`وب‌سایت زیر را دسته‌بندی کن. اطلاعات آن را بخوان و با ابزار update_item فقط فیلدهای category و در صورت نیاز description را تکمیل کن. اگر دسته‌بندی قبلی درست است حفظش کن.\nعنوان: ${w.title}\nURL: ${w.url}\nتوضیحات: ${w.description}\nفقط پس از به‌روزرسانی موفق نتیجه را گزارش بده.`);}
async function organizeIdeas(){await sendAI('تمام ایده‌های فعال در بانک ایده را بررسی کن. موارد مشابه را شناسایی کن و برای هر ایده با استفاده از update_item دسته‌بندی مشخص، وضعیت مناسب (captured یا sorting یا ready)، برچسب‌های مرتبط و در صورت امکان یک گام بعدی کوتاه در فیلد next_step ثبت کن. ایده‌ها را حذف نکن. در پایان خلاصه‌ای از گروه‌بندی‌ها بده.');}
async function analyzeGoals(){await sendAI('اهداف فعال من را همراه با پروژه‌ها و وظایف مرتبط بررسی کن. برای هر هدف میزان پیشرفت واقعی را برآورد کن و از update_item برای درج progress و next_step استفاده کن. اگر داده کافی نیست، مقدار فعلی را حدس نزن و کمبود داده را توضیح بده.');}
async function syncNow(){try{toast('در حال همگام‌سازی...');const r=await window.smartday.syncNow();state=await window.smartday.getState();setPage(currentPage);toast('همگام‌سازی انجام شد.');}catch(e){toast(e.message,true);}}
function updateMethod(value){state.settings.productivityMethod=value;persist().then(()=>{if(currentPage==='tasks')taskView=value;setPage(currentPage);toast('روش بهره‌وری تغییر کرد.');});}
function quickAdd(){showModal(`<div class="modal"><div class="modal-head"><div><h2>ثبت سریع</h2><p>نوع مورد را انتخاب کن و بدون خروج از جریان کار آن را ثبت کن.</p></div><button class="modal-close" data-action="modal-close">×</button></div><div class="card-grid">${[['tasks','☷','وظیفه'],['reminders','◷','یادآور'],['ideas','✧','ایده'],['notes','▤','یادداشت'],['websites','◎','وب‌سایت'],['events','▣','رویداد']].map(([s,i,t])=>`<button class="entity-card" data-action="quick-section" data-section="${s}"><span class="entity-mark">${i}</span><div class="entity-title">${t}</div></button>`).join('')}</div></div>`);}
function todayDateInput(){return Jalali.format(new Date());}
async function setMood(mood){const today=localDateKey();let item=state.moods.find(x=>x.date===today&&!x._deleted_at);if(item){item.mood=mood;item.note=$('#moodNote')?.value||item.note||'';item.updated_at=isoNow();}else state.moods.push({id:uid('mood'),date:today,mood,note:'',created_at:isoNow(),updated_at:isoNow()});await persist();setPage('mood');toast('حال امروز ثبت شد.');}
async function toggleHabit(id){const today=localDateKey();let item=state.habitLogs.find(x=>x.habit_id===id&&x.date===today&&!x._deleted_at);if(item){item._deleted_at=isoNow();item.updated_at=isoNow();}else state.habitLogs.push({id:uid('habitlog'),habit_id:id,date:today,done:true,created_at:isoNow(),updated_at:isoNow()});await persist();setPage(currentPage);}
function renderQuickMoodChooser(){setPage('mood');}

// Click delegation for all dynamically rendered controls.
document.addEventListener('click',async event=>{
  const pageButton=event.target.closest('[data-page]');if(pageButton){const p=pageButton.dataset.page;if(p==='project-detail')return;setPage(p);return;}
  const prompt=event.target.closest('[data-prompt]');if(prompt){setPage('assistant');setTimeout(()=>{const input=$('#chatInput');if(input){input.value=prompt.dataset.prompt;input.focus();}},0);return;}
  const btn=event.target.closest('[data-action]');if(!btn)return;
  const {action,section,id}=btn.dataset;
  try{
    if(action==='quick-add'){quickAdd();return;}
    if(action==='quick-section'){closeModal();openForm(btn.dataset.section);return;}
    if(action==='modal-close'){closeModal();return;}
    if(action==='add'){openForm(section,null,{projectId:btn.dataset.project,date:btn.dataset.date});return;}
    if(action==='edit'){openForm(section,id);return;}
    if(action==='archive'){archiveItem(section,id);return;}
    if(action==='open-project'){setProjectPage(id);return;}
    if(action==='complete-task'){completeTask(btn.dataset.id);return;}
    if(action==='complete-reminder'){completeReminder(btn.dataset.id);return;}
    if(action==='snooze'){snoozeReminder(btn.dataset.id);return;}
    if(action==='reminder-filter'){reminderFilter=btn.dataset.filter;setPage('reminders');return;}
    if(action==='open-date'){openDatePicker(btn.dataset.target);return;}
    if(action==='picker-prev'){pickerCursor=shiftJalaliMonth(pickerCursor.year,pickerCursor.month,-1);renderDatePicker();return;}
    if(action==='picker-next'){pickerCursor=shiftJalaliMonth(pickerCursor.year,pickerCursor.month,1);renderDatePicker();return;}
    if(action==='picker-today'){const p=Jalali.parts(new Date());pickerCursor=p;renderDatePicker();dateInputSet(p.day);return;}
    if(action==='picker-close'){$('#'+datePickerTarget+'_picker')?.classList.add('hidden');return;}
    if(action==='choose-date'){dateInputSet(Number(btn.dataset.day));return;}
    if(action==='inspect-website'){await inspectWebsiteFromForm();return;}
    if(action==='organize-ideas'){await organizeIdeas();return;}
    if(action==='categorize-website'){await categorizeWebsite(id);return;}
    if(action==='convert-idea'){const idea=byId('ideas',id);if(!idea)return;showModal(`<div class="modal"><div class="modal-head"><div><h2>تبدیل ایده به اقدام</h2><p>${esc(idea.title)}</p></div><button class="modal-close" data-action="modal-close">×</button></div><div class="field"><label>نوع مورد</label><select class="select" id="convertType"><option value="tasks">ساخت وظیفه</option><option value="projects">ساخت پروژه</option><option value="goals">ساخت هدف</option></select></div><div class="modal-actions"><button class="btn primary" data-action="do-convert-idea" data-id="${id}">ایجاد</button></div></div>`);return;}
    if(action==='do-convert-idea'){const idea=byId('ideas',id);const type=$('#convertType').value;closeModal();openForm(type);setTimeout(()=>{if($('#f_title'))$('#f_title').value=idea.title;if($('#f_description'))$('#f_description').value=idea.content||'';},0);return;}
    if(action==='set-method'){updateMethod(btn.dataset.method);return;}
    if(action==='set-theme'){await window.smartday.savePreferences({theme:btn.dataset.theme});state=await window.smartday.getState();applyTheme();setPage('settings');return;}
    if(action==='toggle-theme'){const dark=document.body.dataset.theme==='dark';await window.smartday.savePreferences({theme:dark?'light':'dark'});state=await window.smartday.getState();applyTheme();return;}
    if(action==='send-dashboard-ai'){const msg=$('#dashboardPrompt')?.value||'';if(!msg.trim())return toast('درخواستت را بنویس.',true);setPage('assistant');await sendAI(msg);return;}
    if(action==='chat-send'){const input=$('#chatInput');const msg=input.value;input.value='';await sendAI(msg);return;}
    if(action==='load-models'){await loadModels();return;}
    if(action==='save-ai'){await saveAI();return;}
    if(action==='test-ai'){try{const r=await window.smartday.testAI();toast(`اتصال موفق؛ ${num(r.count)} مدل در دسترس است.`);}catch(e){toast(e.message,true);}return;}
    if(action==='save-sync'){await saveSync();return;}
    if(action==='sync-now'){await syncNow();return;}
    if(action==='backup-export'){const r=await window.smartday.exportBackup();if(!r.canceled)toast('فایل پشتیبان ذخیره شد.');return;}
    if(action==='backup-import'){const r=await window.smartday.importBackup();if(!r.canceled){state=await window.smartday.getState();setPage(currentPage);toast('پشتیبان بازیابی شد.');}return;}
    if(action==='save-method'){await window.smartday.savePreferences({productivityMethod:$('#defaultMethod').value});state=await window.smartday.getState();toast('روش پیش‌فرض ذخیره شد.');return;}
    if(action==='calendar-prev'){calendarCursor=shiftJalaliMonth(calendarCursor.year,calendarCursor.month,-1);setPage('calendar');return;}
    if(action==='calendar-next'){calendarCursor=shiftJalaliMonth(calendarCursor.year,calendarCursor.month,1);setPage('calendar');return;}
    if(action==='calendar-today'){calendarCursor=Jalali.parts(new Date());selectedCalendarDate=new Date();setPage('calendar');return;}
    if(action==='calendar-select'){selectedCalendarDate=new Date(btn.dataset.date+'T12:00:00');setPage('calendar');return;}
    if(action==='quick-mood'){await setMood(btn.dataset.mood);setPage('dashboard');return;}
    if(action==='set-mood'){const today=localDateKey();state._selectedMood=btn.dataset.mood;$$('.mood-choice').forEach(x=>x.classList.toggle('selected',x.dataset.mood===state._selectedMood));return;}
    if(action==='save-mood'){const chosen=state._selectedMood||alive('moods').find(x=>x.date===localDateKey())?.mood||'neutral';const note=$('#moodNote')?.value||'';const today=localDateKey();let m=state.moods.find(x=>x.date===today&&!x._deleted_at);if(m){m.mood=chosen;m.note=note;m.updated_at=isoNow();}else state.moods.push({id:uid('mood'),date:today,mood:chosen,note,created_at:isoNow(),updated_at:isoNow()});await persist();setPage('mood');toast('حال امروز ذخیره شد.');return;}
    if(action==='toggle-habit'){await toggleHabit(id);return;}
  }catch(error){toast(error.message||'عملیات انجام نشد.',true);}
});

document.addEventListener('submit',async event=>{if(event.target.id==='recordForm'){event.preventDefault();try{await saveRecord(event.target);}catch(e){toast(e.message,true);}}});
document.addEventListener('input',event=>{
  if(event.target.id==='taskSearch'){taskQuery=event.target.value;const tasks=alive('tasks').filter(t=>!taskQuery||`${t.title} ${t.description||''}`.toLowerCase().includes(taskQuery.toLowerCase()));$('#taskWorkspace').innerHTML=renderTaskView(tasks,taskView);}
  if(event.target.id==='contactSearch'){const q=event.target.value.toLowerCase();const rows=alive('contacts').filter(c=>`${c.name} ${c.phone||''} ${c.organization||''}`.toLowerCase().includes(q));$('#contactCards').innerHTML=rows.length?rows.map(contactCard).join(''):empty('مخاطبی پیدا نشد','عبارت جست‌وجو را تغییر بده.','♙');}
});
document.addEventListener('focusout',event=>{if(event.target?.id==='f_url'&&event.target.value.trim()){inspectWebsiteFromForm().catch(e=>{const label=$('#websiteInspectResult');if(label)label.textContent='استخراج خودکار انجام نشد؛ می‌توانی عنوان و توضیح را دستی وارد کنی.';});}});
document.addEventListener('change',async event=>{
  if(event.target.id==='taskView'){taskView=event.target.value;$('#taskWorkspace').innerHTML=renderTaskView(alive('tasks'),taskView);}
  if(event.target.id==='taskFilterProject'){const id=event.target.value;const rows=alive('tasks').filter(t=>id==='all'||t.project_id===id);$('#taskWorkspace').innerHTML=renderTaskView(rows,taskView);}
  if(['prefStartup','prefWidget','prefSound'].includes(event.target.id)){
    const map={prefStartup:'startAtLogin',prefWidget:'widgetEnabled',prefSound:'reminderSound'};const key=map[event.target.id];await window.smartday.savePreferences({[key]:event.target.checked});state=await window.smartday.getState();if(key==='widgetEnabled'){if(event.target.checked)await window.smartday.toggleWidget();else await window.smartday.closeWidget();}toast('تنظیم ذخیره شد.');
  }
  if(event.target.id==='syncEnabled'){state.settings.syncEnabled=event.target.checked;}
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey&&event.key==='Enter'&&event.target.id==='chatInput'){$('#chatSend')?.click();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='n'){event.preventDefault();quickAdd();}
  if(event.key==='Escape'&&$('#modalRoot').classList.contains('open'))closeModal();
});
window.smartday.onQuickAdd(()=>quickAdd());
$('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state?.settings?.theme==='system')applyTheme();});

async function init(){
  try{state=await window.smartday.getState();
    const today=new Date();$('#headerDate').textContent=Jalali.format(today,true);
    if(!state.settings.productivityMethod)state.settings.productivityMethod='kanban';
    taskView=state.settings.productivityMethod;applyTheme();setPage('dashboard');
    if(window.smartday.platform==='win32')document.body.classList.add('windows');
    if(state.settings.widgetEnabled){};
    if(!window.smartday.platform)console.warn('Desktop bridge not found');
  }catch(e){document.body.innerHTML=`<div style="padding:30px;font-family:Tahoma">راه‌اندازی SmartDay ناموفق بود: ${esc(e.message)}</div>`;}
}
window.addEventListener('DOMContentLoaded',init);
