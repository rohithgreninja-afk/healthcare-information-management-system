const $ = id => document.getElementById(id);
const api = window.HimsApi;
const tabs = document.querySelectorAll('.tab-btn');
const panes = document.querySelectorAll('.tab-content');
tabs.forEach(button => button.addEventListener('click', () => {
  panes.forEach(p => p.style.display = 'none');
  tabs.forEach(b => { b.style.color='#666'; b.style.borderBottom='3px solid transparent'; b.style.fontWeight='normal'; });
  button.style.color='#0066cc'; button.style.borderBottom='3px solid #0066cc'; button.style.fontWeight='bold';
  $(button.dataset.tab).style.display='block';
}));

let patients=[], doctors=[], invoices=[];
function cell(row, value) { const td=document.createElement('td'); td.textContent=value ?? ''; row.appendChild(td); return td; }
function showForm(formId, buttonId, visible) { $(formId).style.display=visible?'block':'none'; $(buttonId).style.display=visible?'none':'inline-block'; }
function setError(id, message) { $(id).textContent=message; $(id).style.display=message?'block':'none'; }
function refreshStats() {
  $('stat-patients').textContent=patients.length; $('stat-doctors').textContent=doctors.length; $('stat-invoices').textContent=invoices.length;
  $('stat-revenue').textContent='$'+invoices.filter(i=>i.status==='Paid').reduce((n,i)=>n+Number(i.amount),0).toFixed(2);
}
function fillPatientSelects() {
  for (const [id, selected=''] of [['p-doctor',$('p-doctor').value],['inv-patient',$('inv-patient').value]]) {
    const select=$(id); select.replaceChildren(new Option('Select',''));
    (id==='p-doctor'?doctors:patients).forEach(item=>select.add(new Option(id==='p-doctor'?item.name:item.name,id==='p-doctor'?item.id:item.id)));
    if ([...select.options].some(o=>o.value===selected)) select.value=selected;
  }
}
function renderPatients() {
  const tbody=$('patients-tbody'); tbody.replaceChildren();
  patients.forEach(p=>{const tr=document.createElement('tr');tr.dataset.patientId=p.id;[p.id,p.name,p.age,p.gender,p.blood,p.phone,p.doctor].forEach(v=>cell(tr,v));const td=cell(tr,'');const b=document.createElement('button');b.className='btn-delete';b.textContent='Delete';b.onclick=()=>api.run(async()=>{if(!confirm(`Delete patient ${p.id}? This cannot be undone.`))return;await api.delete(`/api/patients/${encodeURIComponent(p.id)}`);await reload();},$('patient-error'));td.appendChild(b);tbody.appendChild(tr);});
}
function renderDoctors() {
  const tbody=$('doctors-tbody');tbody.replaceChildren();
  doctors.forEach(d=>{const tr=document.createElement('tr');[d.id,d.name,d.specialty,d.department,d.phone].forEach(v=>cell(tr,v));tbody.appendChild(tr);});
}
function renderInvoices() {
  const tbody=$('invoices-tbody');tbody.replaceChildren();
  invoices.forEach(inv=>{const tr=document.createElement('tr');tr.dataset.invId=inv.id;cell(tr,inv.id);cell(tr,inv.patient);cell(tr,api.date(inv.date));cell(tr,inv.description);cell(tr,'$'+Number(inv.amount).toFixed(2));const status=cell(tr,inv.status);status.className=inv.status==='Paid'?'status-paid':'status-unpaid';const action=cell(tr,'');const b=document.createElement('button');b.className='btn-toggle-status';b.textContent=inv.status==='Paid'?'Mark Unpaid':'Mark Paid';b.onclick=()=>api.run(async()=>{await api.patch(`/api/invoices/${encodeURIComponent(inv.id)}/status`,{status:inv.status==='Paid'?'Unpaid':'Paid'});await reload();},$('invoice-error'));action.appendChild(b);tbody.appendChild(tr);});
}
async function reload() {
  const data=await Promise.all([api.get('/api/patients'),api.get('/api/doctors'),api.get('/api/invoices')]);
  [patients,doctors,invoices]=data;renderPatients();renderDoctors();renderInvoices();fillPatientSelects();refreshStats();
}

$('show-patient-form-btn').onclick=()=>showForm('patient-form','show-patient-form-btn',true);
$('cancel-patient-btn').onclick=()=>{showForm('patient-form','show-patient-form-btn',false);['p-name','p-age','p-gender','p-blood','p-phone','p-doctor'].forEach(id=>$(id).value='');setError('patient-error','');};
$('submit-patient-btn').onclick=()=>api.run(async()=>{const data={name:$('p-name').value.trim(),age:$('p-age').value,gender:$('p-gender').value,blood:$('p-blood').value,phone:$('p-phone').value.trim(),doctor:$('p-doctor').value};if(!data.name||!data.age||!data.gender||!data.blood||!data.phone||!data.doctor)throw new Error('Please fill in all fields.');await api.post('/api/patients',data);$('cancel-patient-btn').click();await reload();},$('patient-error'));
$('show-doctor-form-btn').onclick=()=>showForm('doctor-form','show-doctor-form-btn',true);
$('cancel-doctor-btn').onclick=()=>{showForm('doctor-form','show-doctor-form-btn',false);['d-name','d-specialty','d-department','d-phone'].forEach(id=>$(id).value='');setError('doctor-error','');};
$('submit-doctor-btn').onclick=()=>api.run(async()=>{const data={name:$('d-name').value.trim(),specialty:$('d-specialty').value.trim(),department:$('d-department').value.trim(),phone:$('d-phone').value.trim()};if(Object.values(data).some(v=>!v))throw new Error('Please fill in all fields.');await api.post('/api/doctors',data);$('cancel-doctor-btn').click();await reload();},$('doctor-error'));
$('show-invoice-form-btn').onclick=()=>showForm('invoice-form','show-invoice-form-btn',true);
$('cancel-invoice-btn').onclick=()=>{showForm('invoice-form','show-invoice-form-btn',false);['inv-patient','inv-date','inv-description','inv-amount'].forEach(id=>$(id).value='');setError('invoice-error','');};
$('submit-invoice-btn').onclick=()=>api.run(async()=>{const data={patientId:$('inv-patient').value,date:$('inv-date').value,description:$('inv-description').value.trim(),amount:$('inv-amount').value};if(!data.patientId||!data.date||!data.description||data.amount==='')throw new Error('Please fill in all fields.');await api.post('/api/invoices',data);$('cancel-invoice-btn').click();await reload();},$('invoice-error'));
api.run(reload);
