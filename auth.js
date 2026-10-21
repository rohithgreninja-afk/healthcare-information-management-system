(() => {
  const $=id=>document.getElementById(id),login=$('login-form'),signup=$('signup-form');
  async function redirectForRole(){const {user}=await window.HimsApi.get('/api/auth/me');location.href={admin:'admin.html',doctor:'doctor.html',patient:'patient.html'}[user.role];}
  if(login){
    login.addEventListener('submit',async event=>{event.preventDefault();const error=$('login-error');error.textContent='';try{await window.HimsApi.post('/api/auth/login',{email:$('login-email').value.trim(),password:$('login-password').value});await redirectForRole();}catch(e){error.textContent=e.message;}});
    window.HimsApi.get('/api/auth/me').then(redirectForRole).catch(()=>{});
  }
  if(signup){
    const role=$('signup-role'),patientFields=$('patient-fields'),doctorFields=$('doctor-fields'),adminFields=$('admin-fields');
    function updateRole(){const r=role.value;patientFields.hidden=r!=='patient';doctorFields.hidden=r!=='doctor';adminFields.hidden=r!=='admin';$('signup-age').required=r==='patient';$('signup-gender').required=r==='patient';$('signup-blood').required=r==='patient';$('signup-doctor').required=r==='patient';$('signup-specialty').required=r==='doctor';$('signup-department').required=r==='doctor';$('admin-code').required=r==='admin';$('email-opt-in').required=r!=='admin';}
    role.addEventListener('change',updateRole);const requestedRole=new URLSearchParams(location.search).get('role');if(['patient','doctor','admin'].includes(requestedRole))role.value=requestedRole;updateRole();
    window.HimsApi.get('/api/public/doctors').then(doctors=>{const select=$('signup-doctor');select.replaceChildren(new Option('Select a doctor',''));doctors.forEach(d=>select.add(new Option(d.name,d.id)));}).catch(()=>{});
    signup.addEventListener('submit',async event=>{event.preventDefault();const error=$('signup-error');error.textContent='';const data={name:$('signup-name').value.trim(),email:$('signup-email').value.trim(),password:$('signup-password').value,role:role.value,emailOptIn:$('email-opt-in').checked};if(data.role==='patient')Object.assign(data,{age:$('signup-age').value,gender:$('signup-gender').value,blood:$('signup-blood').value,doctorId:$('signup-doctor').value});if(data.role==='doctor')Object.assign(data,{specialty:$('signup-specialty').value.trim(),department:$('signup-department').value.trim()});if(data.role==='admin')data.adminCode=$('admin-code').value;try{const result=await window.HimsApi.post('/api/auth/signup',data);location.href={admin:'admin.html',doctor:'doctor.html',patient:'patient.html'}[result.user.role];}catch(e){error.textContent=e.message;}});
  }
})();
