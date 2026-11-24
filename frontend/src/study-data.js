export function studyDate(value=new Date()){return new Date(new Date(value).getTime()+3*3600000).toISOString().slice(0,10);}
export function studyMinutes(rows,termId=null){return rows.filter(r=>!r.archived_at&&(!termId||r.term_id===termId)).reduce((n,r)=>n+r.duration_minutes,0);}
