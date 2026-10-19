import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const fake=vi.hoisted(()=>({state:null as any,onState:null as any,requests:[] as any[],clients:0,rooms:0,disconnects:0}));
vi.mock('@/lib/robot-realtime',()=>({RobotRealtimeClient:class {
  constructor(onState:any,private onTransport:any){fake.onState=onState;fake.clients++}
  start(){this.onTransport(true,true);fake.onState(structuredClone(fake.state))}
  close(){}
  async request(action:string,body:any={}){
    fake.requests.push({action,body});const a=fake.state.auto;
    if(action==='operator'){
      if(body.command==='AUTO START'){a.auto_running=true;fake.state.auto_running=a.mechanics_enabled}
      if(body.command==='MECHANICS OFF'){a.mechanics_enabled=false;a.target_fresh=true;fake.state.auto_running=false;fake.state.epoch++}
      if(body.command==='MECHANICS ON'){a.mechanics_enabled=true;fake.state.auto_running=a.auto_running;fake.state.epoch++}
    }
    if(action==='command'&&body.command==='STOP'){a.auto_running=false;fake.state.auto_running=false;fake.state.stopped=true}
    fake.onState(structuredClone(fake.state));return structuredClone(fake.state)
  }
}}));
vi.mock('livekit-client',()=>({
 Room:class {remoteParticipants=new Map();constructor(){fake.rooms++}on(){}async connect(){}async disconnect(){fake.disconnects++}},
 RoomEvent:{TrackPublished:'published',TrackSubscribed:'subscribed',TrackUnsubscribed:'unsubscribed',Reconnecting:'reconnecting',Reconnected:'reconnected',Disconnected:'disconnected'},
 Track:{Kind:{Video:'video'}}
}));
import MechanicalControl from '../app/components/MechanicalControl';
import Page from '../app/page';
const chooseTab=(name:string)=>fireEvent.click(screen.getByRole('tab',{name}));
beforeEach(()=>{
 fake.requests=[];
 fake.clients=0;fake.rooms=0;fake.disconnects=0;
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({url:'wss://camera.example',token:'test-only'})}));
 const pose={p1:1300,p10:950,p11:1250,d2:2100,d3:600,p4:500,p9:1900};
 fake.state={connected:true,fresh:true,stopped:false,busy:false,epoch:3,job:'Ready',progress:100,simulation:true,auto_rear:false,auto_running:false,
 hardware:{joints:{...pose},motors:[0,0,0,0],sensors:{D19:1,D18:1}},log:[],command_trace:[],
 config:{limits:{p1:[500,3500],p10:[500,2500],p11:[500,2500],d2:[500,2500]},poses:{SEARCH:{...pose},SETUP:{...pose},PLACE:{...pose},REAR:{...pose}},grip:{open:600,close:1400},bins:{RECYCLE:2350,ORGANIC:1000,HAZARD:1450,OTHER:1900}},
 auto:{operator_protocol:1,mechanics_enabled:true,auto_running:false,planned_commands:[],target_fresh:false,distance_ready:false}};
});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
const mount=()=>render(<MechanicalControl active autoMode registerStop={()=>{}} onBinChange={()=>{}} onCommand={()=>{}}/>);
async function connect(){fireEvent.click(screen.getByRole('button',{name:'Kết nối Python'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Kết nối Python'}).hasAttribute('disabled')).toBe(false));}
describe('Operator controls with robot ACK',()=>{
 it('green locks manual, red keeps AUTO and permits D2, no toggle notice',async()=>{
  mount();await connect();fireEvent.click(screen.getByRole('button',{name:'Bắt đầu AUTO'}));
  chooseTab('Bánh xe');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Tiến thẳng'}).hasAttribute('disabled')).toBe(true));
  const toggle=screen.getByRole('button',{name:'Quyền điều khiển cơ khí của Auto'});
  fireEvent.click(toggle);await waitFor(()=>expect(toggle.getAttribute('aria-pressed')).toBe('false'));
  expect(fake.state.auto.auto_running).toBe(true);
  expect(screen.getByRole('button',{name:'Tiến thẳng'}).hasAttribute('disabled')).toBe(false);
  chooseTab('Cánh tay');
  fireEvent.change(screen.getByRole('spinbutton',{name:'Xung Xoay càng kẹp'}),{target:{value:'2300'}});
  fireEvent.click(screen.getAllByRole('button',{name:'Gửi',exact:true})[3]);
  await waitFor(()=>expect(fake.requests.some(x=>x.body.joint==='d2'&&x.body.pulse_us===2300)).toBe(true));
 });
 it('shows range only after robot confirmation; routes grasp/release/STOP',async()=>{
  fake.state.auto.mechanics_enabled=false;fake.state.auto.target_fresh=true;mount();await connect();
  chooseTab('Auto & lệnh');
  expect(screen.queryByText('Đã đạt khoảng cách 25–30 cm · đã xác nhận cảm biến')).toBeNull();
  await act(async()=>{fake.state.auto.distance_ready=true;fake.onState(structuredClone(fake.state));});
  expect(screen.getByText('Đã đạt khoảng cách 25–30 cm · đã xác nhận cảm biến')).toBeTruthy();
  chooseTab('Cánh tay');
  fireEvent.click(screen.getByRole('button',{name:'Gắp và nâng vật'}));
  await waitFor(()=>expect(fake.requests.some(x=>x.action==='operator'&&x.body.command==='GRASP')).toBe(true));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Thả vật vào thùng'}).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Thả vật vào thùng'}));
  await waitFor(()=>expect(fake.requests.some(x=>x.action==='operator'&&x.body.command==='RELEASE')).toBe(true));
  fireEvent.click(screen.getByRole('button',{name:'Dừng AUTO'}));
  await waitFor(()=>expect(fake.state.stopped).toBe(true));
 });
 it('keyboard wheel release sends XM and preserves red AUTO',async()=>{
  fake.state.auto.mechanics_enabled=false;fake.state.auto.auto_running=true;mount();await connect();
  chooseTab('Bánh xe');
  const wheel=screen.getByRole('button',{name:'Tiến thẳng'});fireEvent.keyDown(wheel,{key:' '});
  await waitFor(()=>expect(fake.requests.some(x=>x.body.command==='DRIVE FORWARD')).toBe(true));
  fireEvent.keyUp(wheel,{key:' '});await waitFor(()=>expect(fake.requests.some(x=>x.body.command==='XM')).toBe(true));
  expect(fake.state.auto.auto_running).toBe(true);
 });
 it('old Python cannot enable the new commands',async()=>{
  delete fake.state.auto.operator_protocol;mount();
  expect(screen.getByRole('button',{name:'Quyền điều khiển cơ khí của Auto'}).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button',{name:'Bắt đầu AUTO'}).hasAttribute('disabled')).toBe(true);
 });
 it('switching control groups releases held wheels and preserves joint drafts',async()=>{
  fake.state.auto.mechanics_enabled=false;fake.state.auto.auto_running=true;mount();await connect();
  fireEvent.change(screen.getByRole('spinbutton',{name:'Xung Xoay càng kẹp'}),{target:{value:'2300'}});
  chooseTab('Bánh xe');
  fireEvent.keyDown(screen.getByRole('button',{name:'Tiến thẳng'}),{key:' '});
  await waitFor(()=>expect(fake.requests.some(x=>x.body.command==='DRIVE FORWARD')).toBe(true));
  chooseTab('Thùng & nắp');
  await waitFor(()=>expect(fake.requests.some(x=>x.body.command==='XM')).toBe(true));
  expect(screen.queryByRole('button',{name:'Tiến thẳng'})).toBeNull();
  expect(screen.getByRole('button',{name:'Mở nắp'})).toBeTruthy();
  chooseTab('Cánh tay');
  expect((screen.getByRole('spinbutton',{name:'Xung Xoay càng kẹp'}) as HTMLInputElement).value).toBe('2300');
  expect(fake.state.auto.auto_running).toBe(true);
  expect(fake.requests.some(x=>x.body.command==='STOP')).toBe(false);
 });
 it('supports keyboard navigation between named control panels',()=>{
  mount();
  const arm=screen.getByRole('tab',{name:'Cánh tay'});
  fireEvent.keyDown(arm,{key:'ArrowRight'});
  expect(screen.getByRole('tab',{name:'Bánh xe'}).getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(screen.getByRole('tab',{name:'Bánh xe'}));
  expect(screen.getByRole('tabpanel',{name:'Bánh xe'})).toBeTruthy();
 });
 it('keeps the same camera and robot session when switching modes and control groups',async()=>{
  render(<Page/>);await connect();
  const video=screen.getByLabelText('Hình ảnh trực tiếp từ camera robot');
  fireEvent.click(screen.getByRole('button',{name:'AUTO',exact:true}));
  chooseTab('Bánh xe');chooseTab('Thùng & nắp');chooseTab('Cánh tay');
  fireEvent.click(screen.getByRole('button',{name:'MANUAL',exact:true}));
  expect(screen.getByLabelText('Hình ảnh trực tiếp từ camera robot')).toBe(video);
  expect(fake.clients).toBe(1);expect(fake.rooms).toBe(1);expect(fake.disconnects).toBe(0);
  expect(fake.requests.filter(x=>x.action!=='connect')).toEqual([]);
  fireEvent.click(screen.getByRole('button',{name:'DỪNG KHẨN'}));
  await waitFor(()=>expect(fake.requests.filter(x=>x.body.command==='STOP')).toHaveLength(1));
 });
});
