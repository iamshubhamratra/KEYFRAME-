const http=require("http");
function post(p){return new Promise((res,rej)=>{
  const d=JSON.stringify(p);
  const req=http.request({hostname:"localhost",port:8080,path:"/api/generate",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(d)}},r=>{
    let t="";r.on("data",x=>t+=x);r.on("end",()=>{if(r.statusCode===202)res(JSON.parse(t).jobId);else rej(new Error(t))});
  });
  req.on("error",rej);req.write(d);req.end();
});}
function get(id){return new Promise((res,rej)=>{
  http.get({hostname:"localhost",port:8080,path:`/api/jobs/${id}`},r=>{
    let t="";r.on("data",x=>t+=x);r.on("end",()=>res(JSON.parse(t)));
  }).on("error",rej);
});}
async function poll(id,label){
  for(let i=0;i<80;i++){
    await new Promise(r=>setTimeout(r,8000));
    const j=await get(id);
    console.log(`${label} [${i}] ${j.status} ${j.progress||""} ${j.videoUrl||""}`);
    if(j.status==="done"||j.status==="failed") return j;
  }
  throw new Error(label+" timeout");
}
(async()=>{
  const payload={prompt:"Energetic launch for a new fitness app — track workouts, crush goals, join the challenge today.",duration:20,orientation:"horizontal",quality:"720p",tts:true,music:true,sound_effect:true,images:true,framePack:"blockframe"};
  console.log("trigger A");
  const a=await post(payload);
  console.log("A job",a);
  await new Promise(r=>setTimeout(r,1500));
  console.log("trigger B (same payload, different seed)");
  const b=await post(payload);
  console.log("B job",b);
  const [ra,rb]=await Promise.all([poll(a,"A"),poll(b,"B")]);
  console.log("A done",ra.videoUrl, JSON.stringify(ra.usage?.external));
  console.log("B done",rb.videoUrl, JSON.stringify(rb.usage?.external));
  const fs=require("fs"),path=require("path"),crypto=require("crypto");
  function insp(id){const dir=path.join("server","jobs",id,"audio");const mp=path.join(dir,"music.mp3");const rp=path.join(dir,"audio-report.json");const rep=fs.existsSync(rp)?JSON.parse(fs.readFileSync(rp,"utf8")):null;const sz=fs.existsSync(mp)?fs.statSync(mp).size:null;const h=fs.existsSync(mp)?crypto.createHash("md5").update(fs.readFileSync(mp)).digest("hex").slice(0,12):null;return {id,sz,h,rep};}
  const ia=insp(a), ib=insp(b);
  console.log("A",ia); console.log("B",ib);
  console.log("VARIETY:", ia.h!==ib.h ? "DIFFERENT TRACKS ✓" : "SAME HASH ✗");
  console.log("REAL TRACK:", (ia.sz>600000 && ib.sz>600000) ? "REAL MP3 ✓" : "PAD SUSPECT ✗");
})();
