(() => {
  const form=document.getElementById('link-email-form');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const error=document.getElementById('link-email-error');error.textContent='';
    try{
      const {user}=await window.HimsApi.post('/api/auth/link-email',{
        phone:document.getElementById('link-phone').value.trim(),
        password:document.getElementById('link-password').value,
        email:document.getElementById('link-email').value.trim(),
        emailOptIn:document.getElementById('link-email-opt-in').checked
      });
      location.href={admin:'admin.html',doctor:'doctor.html',patient:'patient.html'}[user.role];
    }catch(e){error.textContent=e.message;}
  });
})();
