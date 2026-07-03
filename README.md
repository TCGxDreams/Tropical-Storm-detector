# 🌀 StormWatch Global — Theo dõi bão toàn cầu thời gian thực

Trang web theo dõi bão nhiệt đới trên toàn thế giới với **quả địa cầu 3D kiểu NASA**, dữ liệu **cập nhật thời gian thực** và ảnh vệ tinh NASA.

![3D Globe](https://img.shields.io/badge/Map-3D%20%2F%202.5D%20%2F%202D-blue) ![Realtime](https://img.shields.io/badge/Data-Realtime-red) ![No build](https://img.shields.io/badge/Build-Không%20cần-green)

## ✨ Tính năng

- 🌍 **Quả địa cầu 3D** (CesiumJS) với 3 chế độ xem: **3D**, **2.5D** (Columbus View) và **2D**
- 🛰️ **Ảnh vệ tinh NASA GIBS**: ảnh màu thật cập nhật hàng ngày, Blue Marble, đèn đêm (Black Marble), kèm lớp phủ biên giới & địa danh
- 🌀 **Dữ liệu bão thời gian thực** từ:
  - **GDACS** (Global Disaster Alert and Coordination System — phạm vi toàn cầu)
  - **NOAA / NHC** (National Hurricane Center — bổ sung áp suất, hướng di chuyển)
- 🔄 **Tự động làm mới mỗi 5 phút** (có đồng hồ đếm ngược + nút làm mới ngay)
- 🎨 Phân cấp bão theo thang **Saffir–Simpson** với màu chuẩn quốc tế
- 📈 **Đường đi của bão** (quá khứ + dự báo), nón dự báo và vùng cảnh báo ảnh hưởng
- 📋 Panel chi tiết từng cơn bão: sức gió, áp suất, mức cảnh báo, khu vực ảnh hưởng, link báo cáo đầy đủ
- 🌐 Địa cầu tự xoay, biểu tượng bão xoáy động theo cường độ
- 📱 Giao diện tối kiểu NASA, hỗ trợ màn hình nhỏ

## 🚀 Cách chạy

Không cần cài đặt hay build — chỉ là HTML/CSS/JS thuần:

```bash
# Cách 1: dùng Python
python3 -m http.server 8080

# Cách 2: dùng Node.js
npx serve .
```

Rồi mở trình duyệt tại **http://localhost:8080**

> Cũng có thể mở trực tiếp file `index.html`, nhưng chạy qua HTTP server được khuyến nghị để tránh hạn chế CORS của trình duyệt.

## 🗂️ Cấu trúc

```
├── index.html      # Trang chính
├── css/style.css   # Giao diện (dark theme kiểu NASA)
└── js/
    ├── storms.js   # Lớp dữ liệu: GDACS + NOAA NHC, fallback CORS proxy
    └── app.js      # Cesium globe, lớp ảnh GIBS, vẽ bão, UI
```

## 📡 Nguồn dữ liệu

| Nguồn | Dùng cho | Địa chỉ |
|---|---|---|
| GDACS | Danh sách bão toàn cầu, đường đi, vùng ảnh hưởng | gdacs.org |
| NOAA NHC | Bão Đại Tây Dương / Đông TBD (áp suất, di chuyển) | nhc.noaa.gov |
| NASA GIBS | Ảnh vệ tinh nền (WMTS) | gibs.earthdata.nasa.gov |

Nếu tất cả nguồn dữ liệu đều không truy cập được (mất mạng…), trang sẽ hiển thị **dữ liệu mẫu** kèm cảnh báo `DEMO` để giao diện vẫn xem được.

## ⚠️ Lưu ý

- Dữ liệu chỉ mang tính tham khảo. Khi có bão, hãy theo dõi bản tin chính thức của **Trung tâm Dự báo KTTV Quốc gia** (nchmf.gov.vn).
- Ảnh vệ tinh "màu thật" lấy của ngày hôm trước vì NASA GIBS xử lý ảnh trễ vài giờ.
