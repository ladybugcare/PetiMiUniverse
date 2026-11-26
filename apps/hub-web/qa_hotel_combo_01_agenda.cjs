const { chromium } = require('@playwright/test');
const fs = require('fs');
const OUT='/tmp/qa_hotel_combo';
const PW='QaStaging!2026'; BASE='http://localhost:3002'; API='http://localhost:3000';
const UNIT='5fe7b990-4c08-486c-a0b4-cf65ef82543b'; CLINIC='0b0843d6-5d52-42fb-8685-3cf240ad35ef'; DATE='2026-11-22';
const RECEP='qa.fundador.banho.recepcao@petmi.test'; STAFF='33eb780d-c908-475d-a241-cd4c3613327b';
const stamp=Date.now().toString().slice(-5);
const ev={step:'agenda_ends',status:'NÃO VALIDADO',stamp,ui:{},api:{}};
function brt(iso){return new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',hour12:false});}
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage(); page.setDefaultTimeout(45000);
  let createdId=null;
  page.on('response',async(res)=>{
    try{const u=res.url().split('?')[0];
      if(res.request().method()==='POST'&&/\/api\/hub\/appointments$/.test(u)){
        const j=await res.json().catch(()=>null); const a=j?.appointment||j;
        if(a?.id){createdId=a.id; ev.api.create={status:res.status(),id:a.id,starts_at:a.starts_at,ends_at:a.ends_at,brt:`${brt(a.starts_at)} -> ${brt(a.ends_at)}`,overnight:String(a.starts_at).slice(0,10)!==String(a.ends_at).slice(0,10)};}
        else ev.api.create={status:res.status(),body:JSON.stringify(j).slice(0,500)};
      }}catch(_){}});
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email',{exact:true}).fill(RECEP);
  await page.getByRole('textbox',{name:'Senha'}).fill(PW);
  await page.getByRole('button',{name:/Entrar/i}).click();
  await page.waitForURL(/\/hub/,{timeout:90000});
  await page.evaluate(u=>localStorage.setItem('selected_unit_id',u),UNIT);
  await page.goto(`${BASE}/hub/appointments?date=${DATE}`);
  for(let i=0;i<25;i++){await page.waitForTimeout(400); if(!/Carregando agenda/i.test(await page.locator('body').innerText())) break;}
  await page.getByRole('button',{name:'+ Novo'}).click();
  const dlg=page.getByRole('dialog',{name:/Novo agendamento/i});
  await dlg.waitFor({timeout:15000});
  await page.waitForTimeout(500);
  // tutor via # or placeholder partial
  const tutor=dlg.locator('input').filter({hasNot:dlg.locator('#nam-date')}).first();
  // better: placeholder starts with Buscar por nome
  const tutor2=dlg.locator('input[placeholder^="Buscar por nome"]');
  await tutor2.click({force:true});
  await tutor2.fill('QA Tutor Fundador');
  await page.waitForTimeout(1200);
  await page.getByText(/QA Tutor Fundador/i).first().click({force:true});
  await page.waitForTimeout(800);
  await page.getByText(/QA Rex Fundador/i).first().click({force:true}).catch(()=>{});
  await page.waitForTimeout(400);
  const svc=dlg.getByPlaceholder(/Buscar e adicionar serviço/i);
  await svc.click({force:true}); await svc.fill('Banho'); await page.waitForTimeout(700);
  await page.locator('[role=option], [role=listbox] *').filter({hasText:/^Banho/}).first().click({force:true}).catch(async()=>{
    await page.getByText(/^Banho$/).first().click({force:true});
  });
  await page.waitForTimeout(800);
  // professional
  await dlg.locator('.nam-field').filter({hasText:/Profissional/}).locator('button, input, [role=combobox]').first().click({force:true}).catch(()=>{});
  await page.getByText(/QA Salão Fundador/i).first().click({force:true}).catch(()=>{});
  // times via #nam-starts / #nam-ends
  for (const [sel,val] of [['#nam-starts','10:00'],['#nam-starts','16:00']]){
    const el=dlg.locator(sel);
    if(await el.count()){ await el.click({force:true, clickCount:3}); await el.fill(val); await el.press('Tab'); await page.waitForTimeout(250); }
    else {
      const f=dlg.locator('.nam-field').filter({hasText:/Início/}).locator('input').first();
      await f.click({force:true, clickCount:3}); await f.fill(val); await f.press('Tab');
    }
  }
  ev.ui.starts=await dlg.locator('#nam-starts').inputValue().catch(async()=>dlg.locator('.nam-field').filter({hasText:/Início/}).locator('input').first().inputValue());
  ev.ui.ends=await dlg.locator('#nam-ends').inputValue().catch(async()=>dlg.locator('.nam-field').filter({hasText:/Fim/}).locator('input').first().inputValue());
  const notes=dlg.locator('textarea').first();
  if(await notes.isVisible()) await notes.fill(`QA ends_at combo ${stamp}`);
  await page.screenshot({path:`${OUT}/01_before_save.png`,fullPage:true});
  await dlg.getByRole('button',{name:/Criar agendamento|Salvar/i}).click({force:true});
  await page.waitForTimeout(4000);
  await page.screenshot({path:`${OUT}/01_after_save.png`,fullPage:true});
  await page.goto(`${BASE}/hub/appointments?date=${DATE}`);
  for(let i=0;i<20;i++){await page.waitForTimeout(400); if(!/Carregando agenda/i.test(await page.locator('body').innerText())) break;}
  await page.screenshot({path:`${OUT}/01_reload.png`,fullPage:true});
  const tok=await page.evaluate(()=>{for(const k of Object.keys(localStorage)){if(k.includes('auth-token')){try{return JSON.parse(localStorage.getItem(k)).access_token;}catch(_){}}}return null;});
  if(tok){
    const res=await page.request.get(`${API}/api/hub/appointments?clinic_id=${CLINIC}&unit_id=${UNIT}&from=2026-11-22T03:00:00.000Z&to=2026-11-23T03:00:00.000Z`,{headers:{Authorization:'Bearer '+tok}});
    const j=await res.json();
    const all=(j.appointments||[]).map(a=>({id:a.id,staff:a.hub_staff_member_id,notes:(a.notes||'').slice(0,80),brt:`${brt(a.starts_at)} -> ${brt(a.ends_at)}`,overnight:String(a.starts_at).slice(0,10)!==String(a.ends_at).slice(0,10),hours:(new Date(a.ends_at)-new Date(a.starts_at))/3600000}));
    const target=all.find(a=>a.id===createdId)||all.find(a=>(a.notes||'').includes(stamp))||all.find(a=>a.staff===STAFF&&/16:00/.test(a.brt)&&a.hours>=0.9&&a.hours<=1.1);
    ev.api.target=target||null;
    ev.api.slot17Others=all.filter(a=>a.staff===STAFF&&/17:00/.test(a.brt.split(' -> ')[0])&&a.id!==target?.id);
  }
  ev.status=(ev.api.target&&!ev.api.target.overnight&&/16:00/.test(ev.api.target.brt)&&/17:00/.test(ev.api.target.brt))?'PASSOU':'FALHOU';
  fs.writeFileSync(`${OUT}/01_agenda_ends.json`,JSON.stringify(ev,null,2));
  console.log(JSON.stringify(ev,null,2));
  await browser.close();
})().catch(e=>{ev.status='FALHOU';ev.error=String(e);fs.writeFileSync(`${OUT}/01_agenda_ends.json`,JSON.stringify(ev,null,2));console.error(e);process.exit(1);});
