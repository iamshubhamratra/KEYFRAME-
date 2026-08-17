const path = require("path"), puppeteer = require("puppeteer-core");
const dir = process.argv[2], times = process.argv.slice(3).map(Number);
(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const url = "file:///" + path.resolve(dir + "/index.html").split(path.sep).join("/");
  await p.goto(url, { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 2000));
  for (const t of times) {
    await p.evaluate((tt) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(tt); }, t);
    await new Promise((r) => setTimeout(r, 400));
    await p.screenshot({ path: `${dir}/t${String(t).replace(".", "_")}.png` });
    console.log("shot", t);
  }
  await b.close();
})();
