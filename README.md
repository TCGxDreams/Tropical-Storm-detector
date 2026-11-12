# StormWatch Global

Ứng dụng theo dõi bão nhiệt đới bằng bản đồ Cesium 3D và 2D. Giao diện tiếng Việt có tìm kiếm không dấu, lịch sử đường đi, bảng so sánh, xuất CSV và thời tiết theo điểm chọn trên bản đồ.

## Chạy tại máy

```sh
npm ci
npm run dev
```

`npm run lint` kiểm tra mã. `npm run build` tạo bản production trong `dist/`. Dùng `npm run preview` để xem bản build tại máy.

## Nguồn dữ liệu

- GDACS, NOAA NHC và NOAA IBTrACS cung cấp danh sách bão và đường đi khi có.
- NASA GIBS cung cấp ảnh vệ tinh. Open-Meteo cung cấp thời tiết theo tọa độ.
- Ứng dụng làm mới danh sách bão mỗi 5 phút. Nhãn trên thanh công cụ cho biết khi dữ liệu thiếu nguồn, đã cũ hoặc là dữ liệu mẫu.
- Khi triển khai trên Vercel, `api/proxy.js` hỗ trợ lấy dữ liệu từ các máy chủ GDACS và NOAA đã được cho phép. Máy chủ Vite tại máy phục vụ giao diện. Trình duyệt dùng các phương án lấy dữ liệu dự phòng nếu nguồn gốc chặn truy cập khác miền.
- Mô phỏng 72 giờ dùng hướng và tốc độ di chuyển đã có cùng mô hình đơn giản. Dùng bản tin khí tượng chính thức khi cần ra quyết định.
