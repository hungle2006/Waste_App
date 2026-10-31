# Waste Robot Control · V3.16

## Nhận diện → Firebase và màn hình laptop

Kết quả mục tiêu AI mới từ robot được hiển thị trong **Nhận diện rác** và tự đồng bộ
vào Realtime Database của `smart-genaiot`, đúng đường dẫn `Robot thu gom 1/TrashClasses`:
BIN 1 → `Recyclable`, BIN 2 → `Organic`, BIN 3 → `Hazardous`, BIN 4 → `Others`.
Bốn số là số vật trong kết quả đang hiển thị, không phải tổng thu gom: robot đang khóa
một chai tái chế thì `Recyclable=1` và ba trường khác bằng 0. Kết quả lặp lại không cộng thêm.
Các ứng dụng khác đang đọc bốn số này cần hiểu chúng theo cùng ý nghĩa.

Khi camera có hình và AUTO không chiếm dịch vụ AI, nút **Phân tích ảnh** chụp một JPEG,
gửi tới endpoint Modal hiện có và hiển thị khung nhận diện trên chính ảnh đã gửi.
Ảnh có nhiều vật sẽ đồng bộ số vật từng loại. Ảnh được AI xác nhận không thấy rác
sẽ ghi bốn số 0. Chọn **Trực tiếp** để trở về nguồn nhận diện robot; bật AUTO cũng
tự trở về nguồn robot. Không vẽ tọa độ ảnh cũ lên video mới và không gửi lệnh cơ khí.

Mất kết nối hoặc chưa có kết quả mới không ghi số 0. Trạng thái **Đã đồng bộ Firebase**
chỉ xuất hiện sau phản hồi ghi thành công; lỗi ghi được hiển thị và thử lại có giới hạn tuổi
kết quả. Mỗi tab chỉ gửi một yêu cầu đồng bộ tại một thời điểm và ưu tiên kết quả mới nhất.
Đồng bộ này chạy khi trang Vercel đang mở; đóng trang không tiếp tục đồng bộ ngầm.

API chỉ PATCH bốn trường đã có, giữ các mục khác. Nó sử dụng quyền Realtime Database
hiện tại, không sửa Security Rules hoặc lấy quyền từ Firebase Web API key.
Nếu dự án hạn chế quyền ghi sau này, bổ sung xác thực Firebase ở server thay vì mở Rules.
Không thêm tài khoản hay khóa quản trị vào mã trình duyệt.

Laptop từ 960 px dùng camera bên trái và bảng điều khiển bên phải. Trang cuộn dọc
tự nhiên bằng con lăn, vuốt hai ngón trên touchpad hoặc thanh cuộn trình duyệt,
kể cả khi con trỏ đang ở vùng camera hoặc phần đầu bảng điều khiển. Camera, nhóm
tab điều khiển và thanh đầu có nút Dừng khẩn bám theo khi cuộn. Nội dung điều khiển
mở theo chiều dài, không bị khóa trong một khung cuộn nhỏ. Camera/phiên robot được
giữ nguyên khi đổi tab. Màn hình thấp vẫn cuộn được để không cắt mất nút điều khiển.

Ứng dụng Next.js của dự án Vercel `waste-app`, ghép với bộ Python V3.16.

## Điều khiển

Camera và bảng cơ khí đặt cạnh nhau trên laptop; trang cuộn dọc và giữ camera, nút dừng cùng các nhóm điều khiển trong tầm nhìn. Điện thoại dọc đặt camera phía trên. Chọn **Cánh tay**, **Bánh xe**, **Thùng & nắp** hoặc **Auto & lệnh**. Đổi nhóm không tạo lại phiên camera/robot; đang giữ bánh thì đổi nhóm sẽ gửi XM để dừng.

1. Chạy `python main.py` trên máy robot, rồi bấm **Kết nối Python**.
2. Mở tab AUTO. **Bắt đầu AUTO** chờ ACK của Python.
3. Nút xanh: Auto điều khiển tay, bánh, ngăn và nắp. Nút đỏ: Python hủy chuyển động Auto đang chờ, phanh bánh, giữ xung servo; camera tiếp tục nhận diện và hiển thị lệnh dự kiến. Bảng cơ khí cho phép điều khiển tay.
4. Ở chế độ đỏ, mở nhóm **Cánh tay**. **Gắp và nâng vật** chạy chuỗi đã kiểm tra vị trí/cảm biến. **Thả vật vào thùng** dùng ngăn đã xác nhận khi gắp. Chưa đủ điều kiện thì Python từ chối và giữ tại chỗ.
5. DỪNG/STOP hủy cả Auto và chuỗi gắp/thả; nó khác nút đỏ.

Nút đổi màu theo trạng thái Python đã xác nhận. Chuyển xanh/đỏ không có popup thông báo thành công. Dữ liệu mất liên lạc không được tiếp tục hiển thị là khoảng cách đã đạt. Xung Arduino nhận được không phải phản hồi góc thực tế.

D2: trái 90° = 500 µs, thẳng Oy = 2100 µs, phải 60° = 2500 µs. Không cho góc phải vượt 60°. Xoay tự động theo ảnh cần hiệu chuẩn camera/D2 trong `robot_params.py`; mặc định chưa bật. Giao diện hiển thị điều này. Góc chỉ đổi ở bước gắp và được giữ trong lúc nâng.

## Nút mới V3.16

- **Trái 10° / Phải 10° / 0° Oy**: lấy xung D2 Arduino vừa xác nhận làm mốc, chuyển theo các mốc 500/2100/2500 µs, có chặn trái 90° và phải 60°. Hiển thị góc ước tính từ xung, không phải encoder. Lệnh tương đối tính phía Python; nhấn khi robot bận không tạo thêm hàng chờ.
- **Gắp theo cảm biến** có ở Manual và Auto đỏ, không cần mục tiêu AI. Python xác nhận ba mẫu VL53 mới trong khoảng cấu hình và tay nằm trên quỹ đạo đã đo. Ở tư thế cuối có thể dùng D19. D19 phải ổn định trước khi đóng kẹp; chuỗi không tự chạy bánh. Giữ D2 bạn đã đặt khi hạ và nâng; ngăn thả lấy ngăn hiện tại bạn đang chọn.
- **Nâng / rút tay**: rút theo quỹ đạo đã đo, giữ D2. Nếu kẹp đang đóng phải tiếp tục có D19 giữ vật.
- **Giữ vị trí**: phanh bánh, hủy chuỗi đang chạy, giữ xung servo và chuyển quyền cơ khí về người dùng. Nếu Auto camera đang chạy thì tiếp tục quan sát. STOP vẫn dừng cả hệ thống và khóa servo.
- **Thả vật vào thùng**: xuất hiện cả hai màn hình, chỉ mở khi Python còn ghi nhận vật đã gắp, kẹp đóng và D19 có vật.

Các nút mới cần `operator_protocol=2` của Python V3.16. Python V3.15 vẫn dùng được chức năng cũ, nhưng không có các nút lệnh mới.

## Lời chào khi kết nối

Bấm **Kết nối Python** sẽ gọi giọng nói ngay trong thao tác bấm, trước khi chờ
phản hồi mạng. Câu chào giới thiệu “Mình là Waste Robot”, không thông báo kết nối
thành công trước khi Python xác nhận. Giọng phát trên laptop/điện thoại đang mở
trang, dùng giọng tiếng Việt có sẵn; tốc độ 0,94, cao độ 1,05, âm lượng trong mã 100%.
Nút loa **Phát lại lời chào** cho phép nghe lại mà không gửi lệnh robot.
Lỗi âm thanh có thông báo riêng và không chặn việc kết nối Python.

## Nhích thêm 540 ms sau khi thả nút bánh xe

Tất cả nút tiến, lùi, đi ngang, chéo, quay tại chỗ và cua vẫn làm mới DRIVE mỗi
180 ms khi được giữ. Khi thả chuột/ngón tay hoặc nhả Space/Enter bình thường,
app tiếp tục làm mới cùng hướng thêm 540 ms rồi gửi XM. Bấm nhả nhanh vì thế
vẫn tạo một lượt nhích ngắn. Đây là thời gian phía app; thời gian robot dừng
thực tế phụ thuộc mạng và phản hồi phần cứng. Không sửa Python, Arduino, TTL
500 ms, PWM hoặc điều kiện cảm biến.

Dừng bánh, DỪNG/STOP, Giữ vị trí, đổi nhóm điều khiển, bàn giao cơ khí, mất focus,
ẩn trang, pointercancel, mất trạng thái mới hoặc mất quyền điều khiển đều hủy
nhịp nhích và gửi dừng ngay. Pointerup lặp không kéo dài thêm 540 ms; giữ lại
cùng nút trong thời gian nhích sẽ tiếp tục chạy mà không tạo nhịp dừng/khởi động.

## Phát triển và kiểm tra

```sh
npm ci
npm test
npm run build
npm run dev
```

Mười lăm kiểm thử React DOM kiểm tra chuyển quyền, D2, xác nhận khoảng cách, gắp/thả, STOP, giữ/nhả bánh, dừng bánh khi đổi nhóm, điều hướng bàn phím và giữ nguyên phiên camera/robot khi đổi giao diện. Trạng thái và ACK trong kiểm thử là mô phỏng, không gửi lệnh tới robot. Build kiểm tra TypeScript. Chưa kiểm chứng camera, USB hoặc tải cơ khí thật trong môi trường phát triển.

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

Payload operator: `{ "epoch": 3, "command": "MECHANICS OFF" }`. Lệnh hỗ trợ: `AUTO START`, `AUTO STOP`, `MECHANICS ON`, `MECHANICS OFF`, `GRASP`, `GRASP SENSOR`, `RELEASE`, `LIFT`, `HOLD`, `WRIST LEFT`, `WRIST RIGHT`, `WRIST CENTER`.

Packet vẫn phải có `robot_id`, `client_id`, `request_id`, `session_id`, `seq`, `issued_at`, `ttl_ms`. Python xác nhận bằng `mechanical_ack`; `mechanical_state` mang snapshot mới. DRIVE có TTL 500 ms; các lệnh khác 8 s. Mỗi `request_id` chỉ thực thi một lần. Phiên/thứ tự/thời hạn chống phát lại; chúng không thay thế quyền truy cập kênh Supabase.

`state.auto.operator_protocol == 2` xác nhận Python hỗ trợ chức năng mới. Python cũ vẫn xem/điều khiển cơ khí cũ được; nút Auto mới bị khóa kèm hướng dẫn nâng cấp.

`state.auto`: `mechanics_enabled`, `auto_running`, `assist_running`, `distance_ready`, `tof_mm`, `target_fresh`, `planned_commands`, `orientation_enabled`, `orientation_calibrated`. `state.command_trace` chỉ ghi lệnh đã được Arduino ACK. Pin/BIN/nhãn hiển thị theo dữ liệu nhận, không tự giả định.

