import { chromium } from "playwright";
import fs from "node:fs";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const plans=[
  {width:1440,height:900,targets:{
    ".operator-header":[24,20,1392,78],".eco-hero":[24,114,1392,168],
    ".camera-panel":[24,325,818,505],".control-panel":[858,325,558,null],
    ".vision-telemetry":[24,844,null,null],".recognition-panel":[24,948,null,null]
  }},
  {width:390,height:844,targets:{
    ".operator-header":[0,0,390,73],".eco-hero":[12,85,366,122],
    ".camera-panel":[12,263,366,378],".vision-telemetry":[12,654,366,null],
    ".recognition-panel":[12,859,366,null],".control-panel":[12,1080,366,null]
  }},
  {width:375,height:812,targets:{}},
  {width:768,height:1024,targets:{}}
];
let failed=false;
fs.mkdirSync("artifacts/eco-ui",{recursive:true});
for(const {width,height,targets} of plans){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:"reduce",deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:3000/",{waitUntil:"domcontentloaded",timeout:25000});
  await page.locator(".operator-header").waitFor({timeout:12000});
  await page.screenshot({path:"artifacts/eco-ui/waste-"+width+".png",fullPage:true,animations:"disabled"});
  const report=await page.evaluate(()=>{
    const rect=(sel)=>{const n=document.querySelector(sel);if(!n)return null;const r=n.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y+scrollY),w:Math.round(r.width),h:Math.round(r.height)}};
    const elements=[".operator-header",".eco-hero",".camera-panel",".vision-telemetry",".recognition-panel",".control-panel",".mode-switch",".emergency-button"];
    return {
      scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth,
      controls:Object.fromEntries(elements.map(sel=>[sel,rect(sel)])),
      visibleButtons:[...document.querySelectorAll("button")].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0}).length,
      emergency:!!document.querySelector('button[aria-label="DỪNG KHẨN"]'),
      svgAssets:[...document.querySelectorAll('img[src^="/eco/"]')].map(n=>({src:n.getAttribute("src"),loaded:n.complete&&n.naturalWidth>0})),
    };
  });
  const diffs={};
  for(const [sel,expect] of Object.entries(targets)){
    const r=report.controls[sel];if(!r){diffs[sel]="missing";failed=true;continue;}
    const got=[r.x,r.y,r.w,r.h];const deviations=expect.map((v,i)=>v===null?null:got[i]-v);
    diffs[sel]=deviations;
    if(deviations.some(v=>v!==null&&Math.abs(v)>8)){failed=true;}
  }
  if(report.scrollWidth>width+2 || !report.emergency || report.svgAssets.some(a=>!a.loaded) || report.visibleButtons<10 || errors.length){failed=true}
  console.log("ECO_LAYOUT_RESULT "+JSON.stringify({width,geometry:report.controls,differencesFromFigma:diffs,horizontalOverflow:report.scrollWidth>width+2,assetResults:report.svgAssets,visibleButtons:report.visibleButtons,errors}));
  if(width===390){
    await page.getByRole("tab",{name:"Bánh xe"}).click();
    const selected=await page.getByRole("tab",{name:"Bánh xe"}).getAttribute("aria-selected");
    if(selected!=="true"){failed=true;console.log("FAILED mobile tab selection")}
    await page.screenshot({path:"artifacts/eco-ui/waste-mobile-drive.png",fullPage:true,animations:"disabled"});
  }
  await page.close();
}
await browser.close();
if(failed){console.error("Visual smoke checks failed; inspect ECO_LAYOUT_RESULT and screenshots");process.exit(1);}
console.log("Visual smoke checks passed.");
