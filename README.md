# Waste Robot Control

Frontend hiện đại cho robot phân loại rác, sẵn sàng deploy lên Vercel.

## Tính năng
- Một camera robot với khung hình lớn, xem trọn hình và chế độ toàn màn hình
- Kết nối lại camera khi mất tín hiệu
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
NEXT_PUBLIC_CAMERA_TRACK_NAME=front_camera
LIVEKIT_URL=wss://YOUR_LIVEKIT_HOST
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
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

Camera truyền qua LiveKit/WebRTC, không qua Supabase. Jetson publish một video track tên `front_camera` vào room trùng `NEXT_PUBLIC_ROBOT_ID`. Nếu dùng tên track khác, đặt `NEXT_PUBLIC_CAMERA_TRACK_NAME` đúng với tên đó. Frontend chỉ subscribe video track này.

`LIVEKIT_API_KEY` và `LIVEKIT_API_SECRET` chỉ dùng ở API server, không thêm tiền tố `NEXT_PUBLIC_`. Các biến camera URL cũ không còn dùng trong giao diện.

## Điều khiển cơ khí V3.2 qua Supabase Realtime

Bảng Manual dùng Supabase trên cùng channel robot:robot_01; không dùng API Python HTTPS hoặc các biến ROBOT_BRIDGE_URL/ROBOT_TOKEN/ROBOT_APP_ACCESS_KEY. Giữ 7 biến Production hiện có: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_ROBOT_ID, NEXT_PUBLIC_MODAL_AI_URL, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET. Không thay giá trị/phạm vi hoặc mở quyền publish/data LiveKit.

Client cơ khí gửi event command, type mechanics và action status/connect/command/poses. Python main.py trả mechanical_ack theo request_id/client_id và mechanical_state có state_seq/session_id. Lệnh có seq, epoch và TTL: DRIVE 500 ms, các lệnh khác 8 s. Lệnh tới trễ, trùng, sai phiên, sai robot hoặc hết hạn bị từ chối. XM tăng epoch; STOP hủy chuỗi tư thế và khóa mới. Mất Supabase làm Python STOP; firmware vẫn có watchdog riêng. App chặn điều khiển khi chưa có trạng thái Arduino mới. Broker online không có nghĩa Arduino online.

API /api/robot/configuration chỉ trả các giá trị NEXT_PUBLIC_ để Python lấy cấu hình, cùng cờ LiveKit và protocol mechanics-realtime-v1. Không trả Secret. Các route HTTP cơ khí cũ trả 410 để client cũ không vô tình đi qua tunnel. Camera vẫn qua LiveKit; /api/livekit-token vẫn cấp token chỉ subscribe.

Python mới trên máy robot mở USB khi bấm Kết nối Python và khởi tạo SEARCH. Các khớp P1/P10/P11, kẹp, nắp và ngăn do Python điều phối. Mecanum: M1 trước phải âm tiến, M2 sau trái âm tiến, M3 sau phải âm tiến, M4 trước trái dương tiến. Bố trí con lăn X; PWM mặc định 20. Có 8 hướng dịch chuyển, 2 hướng quay tại chỗ, 4 hướng cua theo cung. Giữ chuột/cảm ứng/Space/Enter để chạy, thả để dừng. Lưu tư thế không làm robot chuyển động.

Python có viewer nhận cùng camera front_camera trong LiveKit để gửi frame JPEG mới tới Modal /detect khi app phát ai:detect. Nguồn publisher Jetson hiện có cần chạy; worker không publish thêm track. Các sự kiện AUTO/mode/arm/bin cũ trên page.tsx và luồng tự động cũ giữ nguyên, worker cơ khí không thêm chu kỳ tự gắp.

Đã kiểm tra build/type, 58 bài Python/API, React DOM với protocol thực, hai client trên Supabase thật ở topic QA riêng với phần cứng mô phỏng và Modal /health HTTP 200. Chưa xác nhận USB/camera/chuyển động trên robot thật. Hướng dẫn đầy đủ nằm trong bộ Python V3.2 mới.
