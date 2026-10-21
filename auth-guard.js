(() => {
  const script=document.currentScript,required=script?.dataset.role;
  const pages={admin:'/admin.html',doctor:'/doctor.html',patient:'/patient.html'};
  fetch('/api/auth/me').then(async response=>{if(!response.ok)throw new Error('signed out');return response.json();}).then(({user})=>{if(required&&user.role!==required){location.replace(pages[user.role]||'/login.html');return;}const button=document.getElementById('logout-btn');if(button)button.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login.html';};}).catch(()=>location.replace('/login.html'));
})();
