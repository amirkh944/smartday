'use strict';
(function(){
  const latinDigits = s => String(s).replace(/[۰-۹٠-٩]/g, ch => '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch) >= 0 ? String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)) : String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
  const faDigits = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  const partsFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian', { year:'numeric', month:'numeric', day:'numeric' });
  const cache = new Map();
  function parts(date){
    const p = {}; for(const x of partsFormatter.formatToParts(date)) if(x.type!=='literal') p[x.type]=Number(x.value);
    return {year:p.year,month:p.month,day:p.day};
  }
  function toJalali(date){ return parts(date); }
  function format(date, withDay=false){
    const p=parts(date); const months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
    return withDay ? `${faDigits(p.day)} ${months[p.month-1]} ${faDigits(p.year)}` : `${faDigits(p.year)}/${faDigits(String(p.month).padStart(2,'0'))}/${faDigits(String(p.day).padStart(2,'0'))}`;
  }
  function toGregorian(jy,jm,jd){
    const key=`${jy}-${jm}-${jd}`; if(cache.has(key)) return new Date(cache.get(key));
    if(jm<1||jm>12||jd<1||jd>31) throw new Error('تاریخ شمسی معتبر نیست.');
    const start = new Date(jy+621,0,1,12,0,0,0); start.setDate(start.getDate()-120);
    for(let i=0;i<600;i++){
      const candidate=new Date(start); candidate.setDate(start.getDate()+i);
      const p=parts(candidate);
      if(p.year===jy&&p.month===jm&&p.day===jd){ cache.set(key,candidate.getTime()); return candidate; }
    }
    throw new Error('روز واردشده در این ماه وجود ندارد.');
  }
  function parse(input){
    const normalized=latinDigits(input).replace(/[.\-]/g,'/').trim();
    const m=normalized.match(/^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/);
    if(!m) throw new Error('تاریخ را به شکل ۱۴۰۵/۰۹/۰۶ وارد کن.');
    const d=toGregorian(Number(m[1]),Number(m[2]),Number(m[3]));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function monthDays(year,month){
    const first=toGregorian(year,month,1); let count=0;
    for(let i=0;i<32;i++){const d=new Date(first);d.setDate(first.getDate()+i);const p=parts(d);if(p.year!==year||p.month!==month)break;count++;}
    return count;
  }
  function monthName(year,month){const names=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];return `${names[month-1]} ${faDigits(year)}`;}
  function weekday(date){return (date.getDay()+1)%7;}
  window.Jalali={parts,format,toGregorian,parse,monthDays,monthName,weekday,faDigits,latinDigits};
})();
