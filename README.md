# Waste Robot Control · V3.15

Ứng dụng Next.js của dự án Vercel `waste-app`, ghép với bộ Python V3.15.

## Điều khiển

1. Chạy `python main.py` trên máy robot, rồi bấm **Kết nối Python**.
2. Mở tab AUTO. **Bắt đầu AUTO** chờ ACK của Python.
3. Nút xanh: Auto điều khiển tay, bánh, ngăn và nắp. Nút đỏ: Python hủy chuyển động Auto đang chờ, phanh bánh, giữ xung servo; camera tiếp tục nhận diện và hiển thị lệnh dự kiến. Bảng cơ khí cho phép điều khiển tay.
4. Ở chế độ đỏ, **Gắp và nâng vật** chạy chuỗi đã kiểm tra vị trí/cảm biến. **Thả vật vào thùng** dùng ngăn đã xác nhận khi gắp. Chưa đủ điều kiện thì Python từ chối và giữ tại chỗ.
5. DỪNG/STOP hủy cả Auto và chuỗi gắp/thả; nó khác nút đỏ.

Nút đổi màu theo trạng thái Python đã xác nhận. Chuyển xanh/đỏ không có popup thông báo thành công. Dữ liệu mất liên lạc không được tiếp tục hiển thị là khoảng cách đã đạt. Xung Arduino nhận được không phải phản hồi góc thực tế.

D2: trái 90° = 500 µs, thẳng Oy = 2100 µs, phải 60° = 2500 µs. Không cho góc phải vượt 60°. Xoay tự động theo ảnh cần hiệu chuẩn camera/D2 trong `robot_params.py`; mặc định chưa bật. Giao diện hiển thị điều này. Góc chỉ đổi ở bước gắp và được giữ trong lúc nâng.

## Phát triển và kiểm tra

```sh
npm ci
npm test
npm run build
npm run dev
```

Bốn kiểm thử React DOM kiểm tra chuyển quyền, D2, xác nhận khoảng cách, gắp/thả, STOP và giữ/nhả bánh. Trạng thái và ACK trong kiểm thử là mô phỏng, không gửi lệnh tới robot. Build kiểm tra TypeScript. Chưa kiểm chứng camera, USB hoặc tải cơ khí thật trong môi trường phát triển.

## Cấu hình Vercel

Giữ các biến hiện có:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_ROBOT_ID`
- `NEXT_PUBLIC_CAMERA_TRACK_NAME` (mặc định `front_camera`)
- `NEXT_PUBLIC_MODAL_AI_URL`
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

Secret LiveKit chỉ dùng phía server; API token cấp quyền subscribe, không publish. Không đưa `.env` của robot lên kho mã. Camera qua LiveKit; lệnh và trạng thái qua Supabase. Không có số pin giả định khi robot chưa gửi dữ liệu.

## Giao thức

Channel `robot:<robot_id>`, event `command`, `type: mechanics`. Các action: `status`, `connect`, `command`, `poses`, mới thêm `operator`.

Payload operator: `{ "epoch": 3, "command": "MECHANICS OFF" }`. Lệnh hỗ trợ: `AUTO START`, `AUTO STOP`, `MECHANICS ON`, `MECHANICS OFF`, `GRASP`, `RELEASE`.

Packet vẫn phải có `robot_id`, `client_id`, `request_id`, `session_id`, `seq`, `issued_at`, `ttl_ms`. Python xác nhận bằng `mechanical_ack`; `mechanical_state` mang snapshot mới. DRIVE có TTL 500 ms; các lệnh khác 8 s. Mỗi `request_id` chỉ thực thi một lần. Phiên/thứ tự/thời hạn chống phát lại; chúng không thay thế quyền truy cập kênh Supabase.

`state.auto.operator_protocol == 1` xác nhận Python hỗ trợ chức năng mới. Python cũ vẫn xem/điều khiển cơ khí cũ được; nút Auto mới bị khóa kèm hướng dẫn nâng cấp.

`state.auto`: `mechanics_enabled`, `auto_running`, `assist_running`, `distance_ready`, `tof_mm`, `target_fresh`, `planned_commands`, `orientation_enabled`, `orientation_calibrated`. `state.command_trace` chỉ ghi lệnh đã được Arduino ACK. Pin/BIN/nhãn hiển thị theo dữ liệu nhận, không tự giả định.
