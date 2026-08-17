const path=require("path"),puppeteer=require("puppeteer-core");
const dir=process.argv[2];
(async()=>{
 const b=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:"new",args:["--no-sandbox","--allow-file-access-from-files"]});
 const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
 await p.goto("file:///"+path.resolve(dir+"/index.html").split(path.sep).join("/"),{waitUntil:"networkidle0",timeout:60000});
 await new Promise(r=>setTimeout(r,1500));
 for(const t of [1.5,3.5,5.5,6.5,7.5,8.5,11.5]){
   const r=await p.evaluate((tt)=>{
     const tl=(window.__timelines||{}).vid; if(!tl) return "no tl";
     tl.pause(); tl.time(tt,false);
     if(window.__kfScript) window.__kfScript(tt);
     const kfs=document.getElementById("kf-script"); if(!kfs) return "no layer";
     for(const el of kfs.querySelectorAll(".kf-ph")) if(el.style.display==="block") return el.textContent.trim();
     return "(nothing visible)";
   },t);
   console.log("t="+t, "->", r);
 }
 await b.close();
})();
