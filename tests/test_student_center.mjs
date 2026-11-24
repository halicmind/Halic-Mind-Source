import assert from 'node:assert/strict';
import test from 'node:test';
import {filterMaterials} from '../frontend/src/materials.js';
import {studyDate,studyMinutes} from '../frontend/src/study-data.js';
test('materials filters combine source course, term, unread and Turkish search',()=>{
 const rows=[{id:1,term_id:1,enrollment_id:3,unread:true,title:'Ağ Çalışması',course_name:'Bilgisayar Ağları'},{id:2,term_id:2,enrollment_id:4,unread:false,title:'Notlar',course_name:'Matematik'}];
 assert.deepEqual(filterMaterials(rows,{term:'1',course:'3',unread:true,query:'ag calismasi'}).map(r=>r.id),[1]);
 assert.equal(filterMaterials(rows,{term:'2',unread:true}).length,0);
});
test('study totals exclude archived entries and other terms',()=>{
 assert.equal(studyDate('2026-11-24T22:10:00Z'),'2026-11-25');
 assert.equal(studyMinutes([{term_id:1,duration_minutes:20},{term_id:2,duration_minutes:90},{term_id:1,duration_minutes:30,archived_at:'x'}],1),20);
});
