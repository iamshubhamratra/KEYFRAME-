const http = require("http");
function post(path, body) {
  return new Promise((resolve,reject)=>{
    const data = JSON.stringify(body);
    const req = http.request({hostname:"localhost",port:8080,path,method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data)}},res=>{
      let t="";res.on("data",d=>t+=d);res.on("end",()=>resolve({status:res.statusCode,body:t}));
    });
    req.on("error",reject); req.write(data); req.end();
  });
}
function get(path){
  return new Promise((resolve,reject)=>{
    http.get({hostname:"localhost",port:8080,path},res=>{
      let t="";res.on("data",d=>t+=d);res.on("end",()=>resolve({status:res.statusCode,body:t}));
    }).on("error",reject);
  });
}
async function main(){
  const payload = {
    prompt: "Energetic launch for a new fitness app — track workouts, crush goals, join the challenge today.",
    duration: 20,
    orientation: "horizontal",
    quality: "720p",
    tts: true,
    music: true,
    sound_effect: true,
    images: true,
    framePack: "blockframe"
  };
  console.log("POST /api/generate", JSON.stringify(payload));
  const r = await post("/api/generate", payload);
  console.log("generate status", r.status);
  console.log(r.body.slice(0,2000));
  if(r.status!==202){console.error("generate failed");return;}
  const {jobId} = JSON.parse(r.body);
  console.log("jobId", jobId);
  // poll
  for(let i=0;i<120;i++){
    await new Promise(rr=>setTimeout(rr,5000));
    const s = await get(`/api/jobs/${jobId}`);
    console.log(`poll ${i} status ${s.status} body ${s.body.slice(0,800)}`);
    try{
      const j=JSON.parse(s.body);
      if(j.status==="done" || j.status==="failed" || j.status==="error"){
        console.log("FINAL", JSON.stringify(j,null,2));
        // try audio report
        const fs=require("fs"); const path=require("path");
        const reportPath = path.join(__dirname, "server","jobs",jobId,"audio","audio-report.json");
        if(fs.existsSync(reportPath)) console.log("audio-report", fs.readFileSync(reportPath,"utf8").slice(0,3000));
        const jobDir = path.join(__dirname,"server","jobs",jobId);
        try{
          const files = fs.readdirSync(path.join(jobDir,"audio"));
          console.log("audio files", files);
          for(const f of files){ try{ console.log(f, fs.statSync(path.join(jobDir,"audio",f)).size);}catch{}}
        }catch(e){console.log("no audio dir",e.message)}
        // check logs for music fetch
        break;
      }
    }catch(e){ console.log("parse fail",e.message)}
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
