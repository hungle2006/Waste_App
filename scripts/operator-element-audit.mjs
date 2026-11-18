import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const output="artifacts/operator-audit";
fs.mkdirSync(output,{recursive:true});
const profiles=[{width:1427,height:726},{width:1440,height:900},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:375,height:812}];
const tabs=[
{name:"Cánh tay",id:"arm",head:"#control-panel-arm .eco-gripper-heading",actions:".eco-gripper-actions button"},
{name:"Bánh xe",id:"drive",head:"#control-panel-drive>div:first-child",actions:".drive-pad-primary button"},
{name:"Thùng & nắp",id:"bins",head:"#control-panel-bins>h3",actions:"#control-panel-bins>.grid button"},
{name:"Auto & lệnh",id:"auto",head:"#control-panel-auto>h3",actions:"#control-panel-auto button"}];
const failures=[],report=[],round=n=>Math.round(n*10)/10;
for(const {width,height} of profiles){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:"reduce"});
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:3000/",{waitUntil:"domcontentloaded",timeout:25000});
 await page.locator(".control-toolbar").waitFor({timeout:15000});
 for(const tab of tabs){
  await page.getByRole("tab",{name:tab.name}).click();
  const data=await page.evaluate(({tab,width})=>{
   const rect=sel=>{const el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
   const tabButtons=[...document.querySelectorAll(".control-tabs button")];
   const widths=tabButtons.map(el=>el.getBoundingClientRect().width);
   const actionNodes=[...document.querySelectorAll(tab.actions)].filter(el=>el.getBoundingClientRect().width>0);
   const actionSizes=actionNodes.map(b=>({label:b.getAttribute("aria-label")||b.textContent.trim(),w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,disabled:b.disabled}));
   const disabled=[...document.querySelectorAll(".control-panel button:disabled")].filter(el=>el.getBoundingClientRect().width>0);
   const connect=document.querySelector(".operator-connection-actions [aria-label='Kết nối Python']");
   const style=connect?getComputedStyle(connect):null;
   const channel=str=>{const a=str?.match(/[\d.]+/g)?.slice(0,3).map(Number);return a?.length===3?a:null;};
   const luminance=rgb=>{if(!rgb)return 0;const v=rgb.map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};
   const fg=luminance(channel(style?.color)),bg=luminance(channel(style?.backgroundColor));
   const contrast=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
   const content=document.querySelector(".control-panel");
   return {width,selected:document.querySelector('.control-tabs [aria-selected="true"]')?.id,
     actionSizes,disabledCount:disabled.length,
     truncatedTabs:tabButtons.filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.textContent.trim()),
     allSvgTabs:tabButtons.every(el=>!!el.querySelector("svg.control-tab-icon")),
     widths, tabs:rect(".control-tabs"),toolbar:rect(".control-toolbar"),
     control:rect(".control-panel"),header:rect(".operator-header"),
     activeHead:rect(tab.head),message:rect(".control-message"),hold:rect(".control-hold-bar"),
     scrollWidth:document.documentElement.scrollWidth,
     connectContrast:contrast,connectOpacity:style?.opacity,
     controlOverflow:content?getComputedStyle(content).overflowY:null,
     videoCount:document.querySelectorAll('video[aria-label="Hình ảnh trực tiếp từ camera robot"]').length};
  },{tab,width});
  if(data.selected!=="control-tab-"+tab.id)failures.push(width+":"+tab.id+" incorrect tab selection");
  if(!data.allSvgTabs)failures.push(width+":"+tab.id+" missing SVG icon");
  if(data.truncatedTabs.length)failures.push(width+":"+tab.id+" truncated tabs "+JSON.stringify(data.truncatedTabs));
  if(Math.max(...data.widths)-Math.min(...data.widths)>1.9)failures.push(width+":"+tab.id+" unequal tab width");
  if(data.scrollWidth>width+2)failures.push(width+":"+tab.id+" horizontal page overflow");
  if(data.connectContrast<4.45)failures.push(width+":"+tab.id+" disabled CTA contrast "+round(data.connectContrast));
  if(data.connectOpacity!=="1")failures.push(width+":"+tab.id+" CTA opacity "+data.connectOpacity);
  if(data.videoCount!==1)failures.push(width+":"+tab.id+" camera video remounted");
  if(!data.activeHead || !data.control || !data.tabs)failures.push(width+":"+tab.id+" missing visible heading");
  if(data.control && data.activeHead && width>=960 && data.activeHead.x<data.control.x+20)failures.push(width+":"+tab.id+" misaligned heading");
  if(data.actionSizes.some(a=>a.h>0&&a.h<39&&!a.disabled))failures.push(width+":"+tab.id+" small active touch target");
  if(errors.length)failures.push(width+":"+tab.id+" JS exception "+errors.join(","));
  report.push({viewport:width,tab:tab.id,top:round(data.activeHead?.y||0),
    headX:round(data.activeHead?.x||0),tabWidth:round(data.widths[0]),
    actionHeights:data.actionSizes.map(a=>round(a.h)),
    disabledContrast:round(data.connectContrast),disabledOpacity:data.connectOpacity,
    disabledCount:data.disabledCount,controlOverflow:data.controlOverflow});
  if(width===1427||width===390){
   if(width>=960)await page.locator(".control-panel").evaluate(el=>el.scrollTop=0);
   else await page.locator(".control-panel").scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,"operator-"+width+"-"+tab.id+".png"),animations:"disabled",fullPage:width<960});
  }
 }
 await page.close();
}
await browser.close();
fs.writeFileSync(path.join(output,"audit-report.json"),JSON.stringify({report,failures},null,2));
console.log("OPERATOR_ELEMENT_AUDIT "+JSON.stringify({tested:report.length,viewports:profiles.map(p=>p.width),tabs:tabs.map(t=>t.id),failures}));
console.log("OPERATOR_ELEMENT_METRICS "+JSON.stringify(report.filter(r=>r.viewport===1427||r.viewport===390)));
if(failures.length)process.exit(1);
console.log("Operator element audit passed.");
