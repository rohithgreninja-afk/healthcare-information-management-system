const resetBtn=document.getElementById('reset-btn');
if(resetBtn)resetBtn.addEventListener('click',async()=>{if(!confirm('This will reset all data to the original state. All changes will be lost. Continue?'))return;resetBtn.disabled=true;try{await window.HimsApi.post('/api/reset',{});window.location.reload();}catch(error){alert(error.message);resetBtn.disabled=false;}});
