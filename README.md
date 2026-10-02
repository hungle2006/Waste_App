# Waste Robot Control

Frontend hiện đại cho robot phân loại rác, sẵn sàng deploy lên Vercel.

## Tính năng
- Camera trước / camera sau
- Manual / Auto
- Tiến / lùi / trái / phải / stop
- Gắp / thả / arm home
- Xoay BIN 1-4 + BIN HOME
- Emergency Stop
- AI status
- Supabase Realtime Broadcast
- Demo mode nếu chưa cấu hình Supabase
- Responsive desktop / tablet / mobile

## Chạy local
```bash
npm install
npm run dev
```
Mở `http://localhost:3000`.

## Environment
Copy `.env.example` thành `.env.local` rồi điền:
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
NEXT_PUBLIC_ROBOT_ID=robot_01
NEXT_PUBLIC_FRONT_CAMERA_URL=
NEXT_PUBLIC_REAR_CAMERA_URL=
NEXT_PUBLIC_MODAL_AI_URL=https://leminhhungleminhhung01012006--waste-robot-ai-api.modal.run
```
Không đưa secret/service-role key vào frontend.

## Deploy Vercel
1. Push folder này lên GitHub.
2. Vercel -> New Project -> Import repository.
3. Project Settings -> Environment Variables -> thêm các biến `NEXT_PUBLIC_*`.
4. Deploy.

## Realtime contract
Channel: `robot:robot_01`

Vercel -> Jetson, event `command`:
```json
{"robot_id":"robot_01","type":"move","action":"forward"}
```
```json
{"robot_id":"robot_01","type":"arm","action":"grab"}
```
```json
{"robot_id":"robot_01","type":"bin","action":"rotate","value":3}
```
```json
{"robot_id":"robot_01","type":"mode","action":"auto_start"}
```

Jetson -> Vercel, event `status`:
```json
{
  "state":"detected",
  "label":"battery",
  "category":"hazardous",
  "bin":3,
  "center":[86,164],
  "battery":91,
  "message":"Battery detected"
}
```

## Mapping BIN
- BIN 1: recyclable
- BIN 2: organic
- BIN 3: hazardous
- BIN 4: other

Camera không truyền qua Supabase. Sau này dùng MJPEG/WebRTC riêng.

 
