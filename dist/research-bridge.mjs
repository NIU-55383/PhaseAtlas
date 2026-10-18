export function attachResearchWorkbench(readConfig,onError){
  const container=document.querySelector('.top-actions');if(!container)return;
  const a=document.createElement('a');a.className='button small';a.textContent='Research workbench';a.href='workbench.html';
  a.addEventListener('click',event=>{
    try{
      const bytes=new TextEncoder().encode(JSON.stringify(readConfig()));
      const encoded=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      if(encoded.length>16000)throw Error('The model link is too long. Export JSON and import it in the workbench.');
      a.href=`workbench.html#experiment=${encoded}`;
    }catch(e){event.preventDefault();onError(e.message);}
  });
  container.append(a);
}
