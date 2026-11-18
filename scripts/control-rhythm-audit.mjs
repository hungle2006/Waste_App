import {chromium} from "playwright";
import fs from "node:fs";

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const viewports=[
  {width:1427,height:726},{width:1440,height:900},{width:1024,height:768},
  {width:768,height:1024},{width:390,height:844},{width:375,height:812}
];
const report=[],failures=[];
fs.mkdirSync("artifacts/control-rhythm",{recursive:true});
const r1=n=>Math.round(n*10)/10;
for(const vp of viewports){
 const page=await browser.newPage({viewport:vp,deviceScaleFactor:1,reducedMotion:"reduce"});
 const errs=[];
 page.on("pageerror",e=>errs.push(e.message));
 await page.goto("http://127.0.0.1:3000/",{waitUntil:"domcontentloaded",timeout:25000});
 await page.getByRole("tab",{name:"Bánh xe"}).click();
 const geometry=await page.evaluate(()=>{
  const box=s=>{
   const n=document.querySelector(s);if(!n)return null;
   const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
  };
  const drive=document.querySelector("#control-panel-drive");
  const buttons=[...document.querySelectorAll(".drive-pad-primary>button")];
  const tabs=[...document.querySelectorAll(".control-tabs button")];
  return {
   toolbar:box(".control-toolbar"),
   toolbarActions:box(".operator-connection-actions"),
   hold:box(".control-hold-bar"),
   message:box(".control-message"),
   tabs:box(".control-tabs"),
   drive:box("#control-panel-drive"),
   header:box(".drive-header"),speed:box(".drive-speed"),
   pad:box(".drive-pad-primary"),
   turns:box(".drive-turn-actions"),feedback:box(".drive-feedback"),
   advanced:box(".drive-advanced"),
   advancedInitiallyClosed:!document.querySelector(".drive-advanced")?.open,
   tabWidths:tabs.map(b=>b.getBoundingClientRect().width),
   driveButtonSizes:buttons.map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})),
   numberOfLiveVideos:document.querySelectorAll('video[aria-label="Hình ảnh trực tiếp từ camera robot"]').length,
   pageOverflow:document.documentElement.scrollWidth>innerWidth+2,
   panelOverflow:getComputedStyle(document.querySelector(".control-panel")).overflowY,
   advancedIcon:!!document.querySelector(".drive-advanced summary svg"),
   screenWidth:innerWidth,
   tabCount:tabs.length,
   activeTab:document.querySelector('[role=tab][aria-selected=true]')?.id,
   mode:document.querySelector(".mode-switch")?.textContent?.trim()
  };
 });
 const gap=(a,b)=>geometry[b]?.y-geometry[a]?.bottom;
 const gaps={toolbarHold:gap("toolbar","hold"),holdMessage:gap("hold","message"),
   messageTabs:gap("message","tabs"),tabsHeader:gap("tabs","header"),
   headerPad:gap("header","pad"),padTurns:gap("pad","turns"),
   turnsFeedback:gap("turns","feedback"),feedbackAdvanced:gap("feedback","advanced")};
 const total=geometry.pad?.width ?? 0;
 const centered=geometry.pad&&geometry.header?Math.abs((geometry.pad.x+geometry.pad.right)/2-(geometry.header.x+geometry.header.right)/2):999;
 const tabRange=Math.max(...geometry.tabWidths)-Math.min(...geometry.tabWidths);
 const buttonHeights=geometry.driveButtonSizes.map(x=>x.h);
 const dimensionOk=geometry.driveButtonSizes.length===5 && buttonHeights.every(x=>x>=65)
   && Math.max(...buttonHeights)-Math.min(...buttonHeights)<=2;
 const maxGap=Math.max(...Object.values(gaps).filter(Number.isFinite));
 const minGap=Math.min(...Object.values(gaps).filter(Number.isFinite));
 const metrics={width:vp.width,gaps:Object.fromEntries(Object.entries(gaps).map(([k,v])=>[k,r1(v)])),
   drivePadWidth:r1(total),centeringDeviation:r1(centered),tabRange:r1(tabRange),
   minGap:r1(minGap),maxGap:r1(maxGap),heights:buttonHeights.map(r1),
   aria:geometry.activeTab,videoCount:geometry.numberOfLiveVideos};
 report.push(metrics);
 if(geometry.activeTab!=="control-tab-drive")failures.push(vp.width+" wrong drive tab");
 if(geometry.tabCount!==4 || tabRange>2)failures.push(vp.width+" uneven tabs");
 if(geometry.pageOverflow)failures.push(vp.width+" horizontal page overflow");
 if(!dimensionOk)failures.push(vp.width+" inconsistent drive button sizes");
 if(centered>7)failures.push(vp.width+" drive pad/header not centered");
 if(minGap<-.1 || maxGap>20 || Math.abs(gaps.padTurns-12)>2)failures.push(vp.width+" uneven control rhythm "+JSON.stringify(gaps));
 if(geometry.numberOfLiveVideos!==1)failures.push(vp.width+" duplicate LiveKit player");
 if(!geometry.advancedInitiallyClosed || !geometry.advancedIcon)failures.push(vp.width+" invalid advanced disclosure");
 if(errs.length)failures.push(vp.width+" JS errors "+errs.join(","));
 if(vp.width>=960 && geometry.panelOverflow!=="auto")failures.push(vp.width+" laptop controls not independently scrollable");
 if([1427,390].includes(vp.width)){
   await page.screenshot({path:"artifacts/control-rhythm/control-"+vp.width+"-collapsed.png",fullPage:false,animations:"disabled"});
   await page.locator(".drive-advanced>summary").click();
   if(!(await page.locator(".drive-advanced").evaluate(el=>el.open)))failures.push(vp.width+" advanced did not open");
   await page.screenshot({path:"artifacts/control-rhythm/control-"+vp.width+"-advanced.png",fullPage:false,animations:"disabled"});
 }
 await page.close();
}
await browser.close();
fs.writeFileSync("artifacts/control-rhythm/measurements.json",JSON.stringify({report,failures},null,2));
console.log("CONTROL_RHYTHM_AUDIT "+JSON.stringify({report,failures}));
if(failures.length)process.exit(1);
console.log("Control rhythm audit passed.");
