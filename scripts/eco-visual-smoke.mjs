import { chromium } from "playwright";
import fs from "node:fs";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const plans=[
  {width:1427,height:726,targets:{
    ".operator-header":[14,10,null,66],".camera-slot":[14,null,null,null],
    ".camera-panel":[14,null,null,null],".control-panel":[null,null,null,null]
  }},
  {width:1366,height:768,targets:{}},
  {width:1440,height:900,targets:{
    ".operator-header":[18,12,null,68],".camera-slot":[18,null,null,null],
    ".camera-panel":[18,null,null,null],".control-panel":[null,null,null,null]
  }},
  {width:390,height:844,targets:{
    ".operator-header":[0,0,390,106],".camera-slot":[12,null,366,null],
    ".camera-panel":[12,null,366,null],".control-panel":[12,null,366,null]
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
    const elements=[".operator-header",".camera-slot",".camera-panel",".vision-telemetry",".recognition-panel",".control-panel",".mode-switch",".emergency-button"];
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
  if(await page.locator(".eco-hero").count()>0){failed=true;console.log("FAILED extra hero")}
  const controlsClear=await page.evaluate(()=>{
    const tabs=document.querySelector(".control-tabs")?.getBoundingClientRect();
    const grip=document.querySelector(".eco-gripper-heading")?.getBoundingClientRect();
    return {tabsBottom:tabs?.bottom,gripTop:grip?.top};
  });
  console.log("COMPACT_CONTROL_ALIGNMENT "+JSON.stringify({width,...controlsClear}));
  if(controlsClear.tabsBottom!=null && controlsClear.gripTop!=null && controlsClear.tabsBottom>controlsClear.gripTop+2){
    failed=true;console.log("FAILED control tabs overlap gripper header");
  }
  console.log("ECO_LAYOUT_RESULT "+JSON.stringify({width,geometry:report.controls,differencesFromFigma:diffs,horizontalOverflow:report.scrollWidth>width+2,assetResults:report.svgAssets,visibleButtons:report.visibleButtons,errors}));
  if(width>=960){
    const portrait=await page.evaluate(()=>{
      const get=s=>document.querySelector(s);
      const rect=s=>get(s)?.getBoundingClientRect();
      const frame=rect(".camera-slot"),surface=rect(".camera-viewport"),
        gift=rect(".gift-bar"),telemetry=rect(".vision-telemetry"),
        ai=rect(".recognition-panel");
      const fit=get(".camera-viewport video");
      const action=get(".gift-dispense");
      const icon=get(".gift-emblem");
      const target=get(".vision-telemetry>div:first-child strong");
      return {
        frame:frame?{w:frame.width,h:frame.height}:null,
        surface:surface?{w:surface.width,h:surface.height}:null,
        gift:gift?{w:gift.width,h:gift.height}:null,
        telemetryHeight:telemetry?.height,aiHeight:ai?.height,
        videoFit:fit?getComputedStyle(fit).objectFit:null,
        giftActionVisible:!!(action&&getComputedStyle(action).display!=="none"),
        giftIconVisible:!!(icon&&getComputedStyle(icon).display!=="none"),
        giftButtonDisabled:action?.disabled,
        targetFits:target?target.scrollWidth<=target.clientWidth+2:null
      }
    });
    console.log("PORTRAIT_CAMERA_GEOMETRY "+JSON.stringify({width,...portrait}));
    const stageCoverage=portrait.surface?.w/portrait.frame?.w;
    if(!portrait.frame || !portrait.surface ||
       !stageCoverage || stageCoverage<.90 || stageCoverage>1.01 ||
       portrait.surface.h<250 ||
       portrait.videoFit!=="contain" || portrait.targetFits!==true || !portrait.giftActionVisible ||
       !portrait.giftIconVisible || !portrait.giftButtonDisabled ||
       !portrait.gift?.h || portrait.gift.h<45 || portrait.gift.h>55 ||
       !portrait.telemetryHeight || portrait.telemetryHeight>53 ||
       !portrait.aiHeight || portrait.aiHeight>110) {
      failed=true;console.log("FAILED near-square camera / gift bar / compact telemetry");
    }
    const split=await page.evaluate(()=>{
      const bounds=sel=>document.querySelector(sel)?.getBoundingClientRect();
      const left=bounds(".vision-column"),right=bounds(".control-panel"),
        workspace=bounds(".operator-workspace"),tabs=document.querySelectorAll(".control-tabs [role=tab]");
      return {leftWidth:left?.width,rightWidth:right?.width,
        leftTop:left?.top,rightTop:right?.top,workspaceWidth:workspace?.width,
        gap:workspace&&getComputedStyle(document.querySelector(".operator-workspace")).columnGap,
        columnDifference:left&&right?Math.abs(left.width-right.width):null,
        visibleTabIcons:[...tabs].filter(tab=>tab.querySelector("svg.control-tab-icon")).length,
        paneOverflow:document.querySelector(".control-panel")&&getComputedStyle(document.querySelector(".control-panel")).overflowY
      };
    });
    console.log("DESKTOP_EQUAL_SPLIT "+JSON.stringify({width,...split}));
    if(!split.leftWidth || !split.rightWidth || (split.columnDifference??999)>2 ||
       Math.abs((split.leftTop??-999)-(split.rightTop??999))>2 ||
       split.visibleTabIcons!==4 || split.paneOverflow!=="auto"){
       failed=true;console.log("FAILED 50/50 desktop split or tab icon system");
    }
    await page.screenshot({path:"artifacts/eco-ui/waste-split-"+width+".png",fullPage:false,animations:"disabled"});
  }
  if(width<960){
    const shape=await page.evaluate(()=>{
      const slot=document.querySelector(".camera-slot")?.getBoundingClientRect();
      const surface=document.querySelector(".camera-viewport")?.getBoundingClientRect();
      const video=document.querySelector(".camera-viewport video");
      return {slot:slot?{w:slot.width,h:slot.height}:null,
        surface:surface?{w:surface.width,h:surface.height}:null,
        videoFit:video?getComputedStyle(video).objectFit:null};
    });
    console.log("RESPONSIVE_CAMERA_SHAPE "+JSON.stringify({width,...shape}));
    const cardRatio=shape.slot?.h/shape.slot?.w,videoRatio=shape.surface?.h/shape.surface?.w;
    if(!cardRatio || cardRatio<1.03 || cardRatio>1.14 ||
       !videoRatio || videoRatio<1.04 || videoRatio>1.13 ||
       shape.videoFit!=="contain"){
      failed=true;console.log("FAILED tablet/mobile near-square live camera");
    }
  }
  if(width===1427){
    const first=await page.evaluate(()=>{
      const rect=sel=>document.querySelector(sel)?.getBoundingClientRect();
      const camera=rect(".camera-slot"),video=rect(".camera-viewport");
      const monitor=document.querySelector(".recognition-panel");
      const counts=rect(".recognition-counts");
      const tabs=rect(".control-tabs");
      const control=document.querySelector(".control-panel");
      const scroll=document.querySelector(".operator-workspace");
      return {
        cameraHeight:camera?.height,videoHeight:video?.height,aiHeight:monitor?.clientHeight,
        aiScrollHeight:monitor?.scrollHeight,aiOverflow:monitor&&getComputedStyle(monitor).overflowY,
        countBottom:counts?.bottom,aiBottom:monitor?.getBoundingClientRect().bottom,
        tabBottom:tabs?.bottom,controlTop:control?.getBoundingClientRect().top,
        headerTop:rect(".operator-header")?.top,
        rightOverflow:control&&getComputedStyle(control).overflowY,
        workspaceOverflow:scroll&&getComputedStyle(scroll).overflow,
        pageScroll:document.documentElement.scrollHeight>window.innerHeight+2,
        horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2
      };
    });
    console.log("LAPTOP_REFERENCE_1427 "+JSON.stringify(first));
    if(!first.cameraHeight || first.cameraHeight<390 || !first.videoHeight || first.videoHeight<292 ||
       !first.aiHeight || first.aiHeight>125 ||
       !first.countBottom || !first.aiBottom || first.countBottom>first.aiBottom+2 ||
       first.aiOverflow!=="hidden" || first.aiScrollHeight>first.aiHeight+4 ||
       first.rightOverflow!=="auto" || first.workspaceOverflow!=="hidden" ||
       first.pageScroll || first.horizontalOverflow){
       failed=true;console.log("FAILED laptop 1427 alignment reference");
    }
    await page.getByRole("tab",{name:"Bánh xe"}).click();
    const pad=await page.locator(".drive-pad-primary").evaluate(el=>{
      const rect=el.getBoundingClientRect(),panel=document.querySelector(".control-panel")?.getBoundingClientRect();
      return {left:rect.left,right:rect.right,width:rect.width,
        centerDelta:panel?Math.abs((rect.left+rect.right)/2-(panel.left+panel.right)/2):null};
    });
    console.log("LAPTOP_DRIVE_PAD_ALIGNMENT "+JSON.stringify(pad));
    if(!pad.width || pad.width>420 || (pad.centerDelta??100)>18)failed=true;
    await page.screenshot({path:"artifacts/eco-ui/waste-1427-drive.png",fullPage:false,animations:"disabled"});
    const beforeScroll=await page.locator(".camera-slot").evaluate(el=>el.getBoundingClientRect().top);
    await page.locator(".operator-extra>summary").click();
    await page.locator(".control-panel").evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.waitForTimeout(250);
    const afterScroll=await page.evaluate(()=>({
      cameraTop:document.querySelector(".camera-slot")?.getBoundingClientRect().top,
      controlScroll:document.querySelector(".control-panel")?.scrollTop,
      pageScroll:window.scrollY,
      liveVideos:document.querySelectorAll('video[aria-label="Hình ảnh trực tiếp từ camera robot"]').length,
    }));
    console.log("LAPTOP_1427_FIXED_MONITOR "+JSON.stringify(afterScroll));
    if(Math.abs((afterScroll.cameraTop??-999)-beforeScroll)>2 ||
       (afterScroll.controlScroll??0)<20 || afterScroll.pageScroll!==0 || afterScroll.liveVideos!==1)failed=true;
    await page.screenshot({path:"artifacts/eco-ui/waste-1427-fixed-camera.png",fullPage:false,animations:"disabled"});
  }
  if(width===1440){
    const initial=await page.evaluate(()=>{
      const cam=document.querySelector(".camera-slot")?.getBoundingClientRect();
      const right=document.querySelector(".control-panel");
      const main=document.querySelector(".operator-workspace");
      return {cameraTop:cam?.top,cameraBottom:cam?.bottom,pageY:window.scrollY,rightHeight:right?.clientHeight,
        workspaceOverflow:main?getComputedStyle(main).overflow:null,
        rightScroll:getComputedStyle(right).overflowY,
        video:document.querySelectorAll('video[aria-label="Hình ảnh trực tiếp từ camera robot"]').length};
    });
    await page.locator(".operator-extra>summary").click();
    await page.locator(".control-panel").evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.waitForTimeout(320);
    const after=await page.evaluate(()=>{
      const cam=document.querySelector(".camera-slot")?.getBoundingClientRect();
      const right=document.querySelector(".control-panel");
      return {cameraTop:cam?.top,cameraBottom:cam?.bottom,pageY:window.scrollY,
        rightScrollTop:right?.scrollTop,rightScrollHeight:right?.scrollHeight,rightClientHeight:right?.clientHeight,
        video:document.querySelectorAll('video[aria-label="Hình ảnh trực tiếp từ camera robot"]').length};
    });
    console.log("DESKTOP_FIXED_MONITOR_RESULT "+JSON.stringify({initial,after}));
    if(!initial.cameraTop || Math.abs(after.cameraTop-initial.cameraTop)>2 ||
      Math.abs(after.cameraBottom-initial.cameraBottom)>2 ||
      after.pageY!==0 || (after.rightScrollTop??0)<20 ||
      initial.rightScroll!=="auto" || initial.workspaceOverflow!=="hidden" ||
      after.video!==1){failed=true;console.log("FAILED independent desktop camera/control scrolling")}
    await page.screenshot({path:"artifacts/eco-ui/waste-desktop-fixed-camera.png",fullPage:false,animations:"disabled"});
  }
  if(width===390){
    const gift=await page.locator(".gift-bar").evaluate(el=>{
      const rect=el.getBoundingClientRect();
      return {w:rect.width,h:rect.height,title:el.querySelector(".gift-title")?.textContent,
        button:el.querySelector(".gift-dispense")?.getAttribute("aria-label"),
        icon:!!el.querySelector(".gift-emblem")};
    });
    console.log("MOBILE_GIFT_BAR "+JSON.stringify(gift));
    if(gift.h<48 || gift.h>56 || !gift.icon || gift.button!=="Đổi quà")failed=true;

    // Primary control panel must be immediately after full-size camera, before statistics.
    const order=await page.evaluate(()=>{
      const camera=document.querySelector(".camera-slot")?.getBoundingClientRect();
      const controls=document.querySelector("#mechanical-control")?.getBoundingClientRect();
      const telemetry=document.querySelector(".vision-telemetry")?.getBoundingClientRect();
      return {cameraBottom:camera?.bottom,controlsTop:controls?.top,telemetryTop:telemetry?.top};
    });
    console.log("MOBILE_VIDEO_FIRST "+JSON.stringify(order));
    if(!order.cameraBottom || !order.controlsTop || !order.telemetryTop || Math.abs(order.controlsTop-order.cameraBottom)>23 || order.telemetryTop<=order.controlsTop){failed=true;}
    await page.getByRole("tab",{name:"Bánh xe"}).click();
    const fiveButtons=await page.locator(".drive-pad-primary button").count();
    const advancedClosed=!(await page.getByRole("button",{name:"Tiến chéo trái"}).count());
    console.log("MOBILE_TASK_FIRST_PAD "+JSON.stringify({fiveButtons,advancedClosed}));
    if(fiveButtons!==5 || !advancedClosed){failed=true;console.log("FAILED main five-button drive pad")}
    const selected=await page.getByRole("tab",{name:"Bánh xe"}).getAttribute("aria-selected");
    if(selected!=="true"){failed=true;console.log("FAILED mobile tab selection")}
    await page.screenshot({path:"artifacts/eco-ui/waste-mobile-drive.png",fullPage:true,animations:"disabled"});
    await page.evaluate(()=>{
      window.__persistentTestVideo=document.querySelector('video[aria-label="Hình ảnh trực tiếp từ camera robot"]');
      window.scrollTo(0,900);
    });
    await page.locator('.camera-panel[data-docked="true"]').waitFor({timeout:3000});
    // Wait for the settled dock transition before checking its final usable footprint.
    await page.waitForTimeout(260);
    await page.screenshot({path:"artifacts/eco-ui/waste-mobile-camera-right.png",fullPage:false,animations:"disabled"});
    const mini=await page.evaluate(()=>{
      const panel=document.querySelector('.camera-panel');
      const video=document.querySelector('video[aria-label="Hình ảnh trực tiếp từ camera robot"]');
      const r=panel?.getBoundingClientRect();
      return {videoNodes:document.querySelectorAll('video[aria-label="Hình ảnh trực tiếp từ camera robot"]').length,sameVideo:video===window.__persistentTestVideo,position:panel&&getComputedStyle(panel).position,rect:r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}:null,scrollWidth:document.documentElement.scrollWidth};
    });
    console.log("MOBILE_DOCKED_CAMERA "+JSON.stringify(mini));
    if(mini.videoNodes!==1 || !mini.sameVideo || mini.position!=="fixed" || !mini.rect || mini.rect.top<0 || mini.rect.bottom>844 || mini.rect.left<0 || mini.rect.right>390 || mini.rect.width>260 || mini.rect.height>180 || mini.scrollWidth>390){failed=true;console.log("FAILED mini camera bounding box")}
    if(!await page.getByRole("button",{name:"Dừng khẩn từ camera thu nhỏ"}).isVisible()){failed=true;}
    await page.getByRole("button",{name:"Chuyển camera thu nhỏ sang trái"}).click();
    if(await page.locator('.camera-panel').getAttribute('data-dock-side')!=="left"){failed=true;}
    await page.screenshot({path:"artifacts/eco-ui/waste-mobile-persistent-camera.png",fullPage:false,animations:"disabled"});
    await page.getByRole("button",{name:"Quay lại camera lớn"}).click();
    await page.waitForTimeout(700);
    const restored=await page.locator('.camera-panel').getAttribute('data-docked');
    console.log("MOBILE_CAMERA_RESTORED "+restored);
    if(restored!=="false"){failed=true}
  }
  await page.close();
}
await browser.close();
if(failed){console.error("Visual smoke checks failed; inspect ECO_LAYOUT_RESULT and screenshots");process.exit(1);}
console.log("Visual smoke checks passed.");
