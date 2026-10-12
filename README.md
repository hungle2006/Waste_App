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

Chế độ Manual dùng bảng cơ khí riêng: 3 thanh kéo P1/P10/P11; P9/P4 dùng nút riêng, tư thế nhanh và lưu tư thế, mở/đóng kẹp D3, nắp, 4 ngăn rác, D15/D16/D18 và điều khiển Mecanum giữ để chạy, thả để dừng. D2/D3 không có thanh kéo. Các thao tác này dùng Python Brain V3 qua API server; camera LiveKit và phần AUTO/DETECT vẫn dùng luồng cũ.

Thêm ba biến server-only trên Vercel (không dùng NEXT_PUBLIC_):

```env
ROBOT_BRIDGE_URL=https://your-python-endpoint.example
ROBOT_TOKEN=
ROBOT_APP_ACCESS_KEY=
```

Hai khóa cần tối thiểu 24 ký tự. ROBOT_TOKEN trùng khóa trên máy chạy Python V3; người dùng nhập ROBOT_APP_ACCESS_KEY vào bảng cơ khí. Python cần endpoint HTTPS truy cập được từ Vercel; giữ Bearer authentication. Khóa app chỉ nằm trong bộ nhớ trang. Các API command/connect/status/poses đều yêu cầu khóa. configuration chỉ trả boolean, không trả bí mật.

Chưa cấu hình thì bảng cơ khí báo chưa kết nối và không gửi lệnh giả. Python V3 cập nhật tự thiết lập tư thế SEARCH và toàn bộ servo khi kết nối USB mới. Sau STOP, Cho phép điều khiển sẽ khởi tạo lại SEARCH. Kết nối tới phiên đang dừng không tự bỏ STOP. Emergency Stop gửi dừng qua cả luồng cũ và Python nếu có khóa. Đổi từ Manual sang Auto dừng luồng cơ khí thủ công đang mở trước đó. Các tham số tư thế và giới hạn do Python trả về. Giá trị 500–2500 µs là giới hạn phần mềm, không phải góc đã hiệu chuẩn.

BIN 1 = tái chế 2350 µs, BIN 2 = hữu cơ 1000 µs, BIN 3 = nguy hiểm 1450 µs, BIN 4 = rác khác 1900 µs. IR thứ hai nối OUT sang Mega D16; PCA P15 là đầu ra PWM. Chọn ngăn chỉ xoay P9, không tự mở nắp/thả rác. Không thêm chu kỳ tự động mới trong bản giao diện này.

Tư thế khởi tạo mặc định là tìm rác phía trước, lấy từ cấu hình SEARCH của Python. Bản Python cũ trước cập nhật này chưa tự khởi tạo; dùng file Python V3 đã cập nhật để có hành vi mới. AUTO/DETECT không thay đổi.


## Mecanum V3.1

M1 trước phải: PWM âm tiến; M2 sau trái: PWM âm tiến; M3 sau phải: PWM âm tiến; M4 trước trái: PWM dương tiến. Bố trí con lăn X. Manual có 8 hướng dịch chuyển, 2 hướng quay tại chỗ và 4 hướng cua theo cung khi tiến/lùi. PWM mặc định 20, chỉnh 1–255 bằng ô số. Giữ chuột/cảm ứng hoặc Space/Enter để chạy; thả, mất focus, hủy chạm và chuyển chế độ sẽ dừng.

Client gửi `DRIVE FORWARD/BACK/LEFT/RIGHT/FORWARD_LEFT/FORWARD_RIGHT/BACK_LEFT/BACK_RIGHT/TURN_LEFT/TURN_RIGHT/ARC_FORWARD_LEFT/ARC_FORWARD_RIGHT/ARC_BACK_LEFT/ARC_BACK_RIGHT`, `speed` và `epoch` qua API proxy tới Python. DRIVE LEFT/RIGHT là đi ngang. XM tăng epoch để từ chối lệnh cũ còn trên mạng. Arduino cấp quyền chạy tối đa 500 ms mỗi lệnh; Python giữ heartbeat USB nhưng không tự gia hạn bánh thay trình duyệt. Python kiểm tra drive_protocol=4 và từ chối firmware cũ trước khi thiết lập servo. Cần nạp Arduino mới và thay cả bộ Python, thêm module mecanum.py. Giữ cấu hình robot_config.json đã hiệu chỉnh của bạn.

Đã kiểm tra build và đường truyền app → API proxy → HTTPS Python với phần cứng mô phỏng. Chuyển động thực tế và kết nối website production tới máy robot cần thử trên phần cứng.
