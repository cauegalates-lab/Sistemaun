import { uid } from './utils.js';

const GOALS_KEY = 'unifahe.fca.weekly.goals.preview.v41';
const LEGACY_GOALS_KEY = 'unifahe.fca.weekly.goals.preview.v31';
const RECORDS_KEY = 'unifahe.fca.weekly.records.preview.v41';
const LEGACY_RECORDS_KEY = 'unifahe.fca.weekly.records.preview.v31';

export const WEEKLY_PERFORMANCE_TASKS = [
  { id:'crm_update', label:'Organizar e atualizar o CRM' },
  { id:'no_idle_leads', label:'Não deixar nenhum lead parado' },
  { id:'personalized_videos', label:'Enviar 5 vídeos personalizados' },
  { id:'min_calls', label:'Realizar no mínimo 10 ligações' }
];

function read(key,legacyKey){
  try{
    const current=localStorage.getItem(key);
    if(current!==null) return JSON.parse(current||'[]');
    return JSON.parse(localStorage.getItem(legacyKey)||'[]');
  }catch{return[]}
}
function write(key,value){ localStorage.setItem(key,JSON.stringify(value)); }
function goalId(seller,weekStart){ return `${seller}__${weekStart}`; }
function recordId(seller,date){ return `${seller}__${date}`; }
export function defaultAssignedTasks(){ return WEEKLY_PERFORMANCE_TASKS.map(task=>({...task,days:[0,1,2,3,4]})); }
function normalizeAssignedTasks(value,{fallback=true}={}){
  const source=Array.isArray(value)?value:(fallback?defaultAssignedTasks():[]);
  return source.map((task,index)=>({
    id:String(task.id||`task_${index}_${uid()}`),
    label:String(task.label||'Tarefa').trim().slice(0,120),
    days:Array.isArray(task.days)?[...new Set(task.days.map(Number).filter(day=>day>=0&&day<=4))]:[0,1,2,3,4]
  })).filter(task=>task.label&&task.days.length);
}
function taskDefaults(catalog){ return Object.fromEntries(normalizeAssignedTasks(catalog,{fallback:false}).map(task=>[task.id,false])); }
function normalizeGoal(raw={}){
  const hasAssigned=Object.prototype.hasOwnProperty.call(raw,'assigned_tasks');
  return { id:raw.id||uid(), seller_name:raw.seller_name||'', week_start:raw.week_start||'', indicator:raw.indicator||'Faturamento semanal', weekly_target:Number(raw.weekly_target||0), assigned_tasks:normalizeAssignedTasks(raw.assigned_tasks,{fallback:!hasAssigned}), updated_by:raw.updated_by||'', updated_at:raw.updated_at||new Date().toISOString() };
}
function normalizeRecord(raw={}){
  const catalog=normalizeAssignedTasks(raw.task_catalog,{fallback:!Array.isArray(raw.task_catalog)});
  return {
    id:raw.id||uid(), seller_name:raw.seller_name||'', date:raw.date||'', week_start:raw.week_start||'', task_catalog:catalog,
    tasks:{...taskDefaults(catalog),...(raw.tasks||{})}, indicator:raw.indicator||'Faturamento semanal', weekly_target:Number(raw.weekly_target||0),
    sold_today:Number(raw.sold_today||0), cumulative_sold:Number(raw.cumulative_sold||0), remaining:Number(raw.remaining||0),
    closed:Boolean(raw.closed), closed_at:raw.closed_at||'', updated_at:raw.updated_at||new Date().toISOString()
  };
}
function dayOfWeek(date){ return new Date(`${date}T12:00:00`).getDay(); }
function datePlus(date,days){ const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10); }
export function weekStartForDate(date){ const d=new Date(`${date}T12:00:00`);const wd=d.getDay()||7;d.setDate(d.getDate()-(wd-1));return d.toISOString().slice(0,10); }
function salesFor(sales,seller,from,to){ return (sales||[]).filter(row=>row.seller_name===seller && row.audit_status==='ok' && row.sale_date>=from && row.sale_date<=to); }
function revenue(rows){ return rows.reduce((sum,row)=>sum+Number(row.total_value||0),0); }

export const WeeklyPerformanceRepository={
  tasks:WEEKLY_PERFORMANCE_TASKS,
  async getGoal(seller,weekStart){
    return normalizeGoal(read(GOALS_KEY,LEGACY_GOALS_KEY).find(row=>row.id===goalId(seller,weekStart))||{id:goalId(seller,weekStart),seller_name:seller,week_start:weekStart});
  },
  async listGoals(weekStart){ return read(GOALS_KEY,LEGACY_GOALS_KEY).map(normalizeGoal).filter(row=>row.week_start===weekStart); },
  async saveGoal({seller_name,week_start,indicator,weekly_target,assigned_tasks,updated_by}){
    const rows=read(GOALS_KEY,LEGACY_GOALS_KEY).map(normalizeGoal),id=goalId(seller_name,week_start),index=rows.findIndex(row=>row.id===id),existing=index>=0?rows[index]:normalizeGoal({id,seller_name,week_start});
    const item=normalizeGoal({...existing,id,seller_name,week_start,indicator:String((indicator ?? existing.indicator) || 'Faturamento semanal').trim()||'Faturamento semanal',weekly_target:Number((weekly_target ?? existing.weekly_target) || 0),assigned_tasks:assigned_tasks===undefined?existing.assigned_tasks:assigned_tasks,updated_by,updated_at:new Date().toISOString()});
    if(index>=0)rows[index]=item;else rows.unshift(item);write(GOALS_KEY,rows);return item;
  },
  async getWeekRecords(seller,weekStart){ return read(RECORDS_KEY,LEGACY_RECORDS_KEY).map(normalizeRecord).filter(row=>row.seller_name===seller&&row.week_start===weekStart).sort((a,b)=>a.date.localeCompare(b.date)); },
  async listWeekRecords(weekStart){ return read(RECORDS_KEY,LEGACY_RECORDS_KEY).map(normalizeRecord).filter(row=>row.week_start===weekStart).sort((a,b)=>a.date.localeCompare(b.date)); },
  async listClosedReports(){ return read(RECORDS_KEY,LEGACY_RECORDS_KEY).map(normalizeRecord).filter(row=>row.closed).sort((a,b)=>String(b.closed_at||b.date).localeCompare(String(a.closed_at||a.date))).slice(0,80); },
  async saveTasks({seller_name,date,week_start,tasks}){
    const rows=read(RECORDS_KEY,LEGACY_RECORDS_KEY).map(normalizeRecord),id=recordId(seller_name,date),index=rows.findIndex(row=>row.id===id),existing=index>=0?rows[index]:null;
    if(existing?.closed) throw new Error('Este dia já foi encerrado e não pode mais ser alterado.');
    const goal=await this.getGoal(seller_name,week_start),catalog=goal.assigned_tasks;
    const item=normalizeRecord({...existing,id,seller_name,date,week_start,task_catalog:catalog,tasks:{...taskDefaults(catalog),...(existing?.tasks||{}),...tasks},indicator:goal.indicator,weekly_target:goal.weekly_target,closed:false,updated_at:new Date().toISOString()});
    if(index>=0)rows[index]=item;else rows.unshift(item);write(RECORDS_KEY,rows);return item;
  },
  async finalizeOverdue({sales=[],sellers=[],today}){
    const current=today||new Date().toISOString().slice(0,10),weekStart=weekStartForDate(current),records=read(RECORDS_KEY,LEGACY_RECORDS_KEY).map(normalizeRecord),goals=read(GOALS_KEY,LEGACY_GOALS_KEY).map(normalizeGoal),now=new Date();
    const atCutoff=now.getHours()>23 || (now.getHours()===23&&now.getMinutes()>=59); let changed=false;
    for(const seller of sellers){
      const goal=goals.find(row=>row.id===goalId(seller,weekStart))||normalizeGoal({id:goalId(seller,weekStart),seller_name:seller,week_start:weekStart});
      for(let i=0;i<5;i++){
        const date=datePlus(weekStart,i); if(dayOfWeek(date)<1||dayOfWeek(date)>5) continue;
        if(date>current || (date===current&&!atCutoff)) continue;
        const id=recordId(seller,date),index=records.findIndex(row=>row.id===id),existing=index>=0?records[index]:normalizeRecord({id,seller_name:seller,date,week_start:weekStart,task_catalog:goal.assigned_tasks,tasks:taskDefaults(goal.assigned_tasks)});
        if(existing.closed) continue;
        const soldToday=revenue(salesFor(sales,seller,date,date)),cumulative=revenue(salesFor(sales,seller,weekStart,date));
        const item=normalizeRecord({...existing,task_catalog:goal.assigned_tasks,tasks:{...taskDefaults(goal.assigned_tasks),...(existing.tasks||{})},indicator:goal.indicator,weekly_target:goal.weekly_target,sold_today:soldToday,cumulative_sold:cumulative,remaining:Math.max(goal.weekly_target-cumulative,0),closed:true,closed_at:new Date().toISOString(),updated_at:new Date().toISOString()});
        if(index>=0)records[index]=item;else records.unshift(item);changed=true;
      }
    }
    if(changed)write(RECORDS_KEY,records); return changed;
  }
};
