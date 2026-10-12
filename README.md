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

## Điều khiển cơ khí V3

Chế độ Manual dùng bảng cơ khí riêng: P1/P10/P11/P9/P4, tư thế nhanh và lưu tư thế, mở/đóng kẹp D3, nắp, 4 ngăn rác, D15/D16/D18 và bước chạy 4 motor trong 300 ms. D2/D3 không có thanh kéo. Các thao tác này dùng Python Brain V3 qua API server; camera LiveKit và phần AUTO/DETECT vẫn dùng luồng cũ.

Thêm ba biến server-only trên Vercel (không dùng NEXT_PUBLIC_):

```env
ROBOT_BRIDGE_URL=https://your-python-endpoint.example
ROBOT_TOKEN=
ROBOT_APP_ACCESS_KEY=
```

Hai khóa cần tối thiểu 24 ký tự. ROBOT_TOKEN trùng khóa trên máy chạy Python V3; người dùng nhập ROBOT_APP_ACCESS_KEY vào bảng cơ khí. Python cần endpoint HTTPS truy cập được từ Vercel; giữ Bearer authentication. Khóa app chỉ nằm trong bộ nhớ trang. Các API command/connect/status/poses đều yêu cầu khóa. configuration chỉ trả boolean, không trả bí mật.

Chưa cấu hình thì bảng cơ khí báo chưa kết nối và không gửi lệnh giả. Kết nối USB bắt đầu ở STOP; Cho phép điều khiển chỉ bỏ khóa, không chạy servo. Emergency Stop gửi dừng qua cả luồng cũ và Python nếu có khóa. Đổi từ Manual sang Auto dừng luồng cơ khí thủ công đang mở trước đó. Các tham số tư thế và giới hạn do Python trả về. Giá trị 500–2500 µs là giới hạn phần mềm, không phải góc đã hiệu chuẩn.

BIN 1 = tái chế 2350 µs, BIN 2 = hữu cơ 1000 µs, BIN 3 = nguy hiểm 1450 µs, BIN 4 = rác khác 1900 µs. IR thứ hai nối OUT sang Mega D16; PCA P15 là đầu ra PWM. Chọn ngăn chỉ xoay P9, không tự mở nắp/thả rác. Không thêm chu kỳ tự động mới trong bản giao diện này.
