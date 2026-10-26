Backend Capstone B-05 2026

Link Model: https://drive.google.com/drive/folders/1qlUjufFUMLQcW69DFPTgipNt-vu9Zj5O?usp=drive_link 

Masukkan link di assets\models

## Detection zones

Admins can edit a camera after saving it and draw a polygon over its latest
frame. The polygon is stored as normalized `detectionZone` points (`x` and `y`
between `0` and `1`) on the camera document. When a zone is configured, ONNX
detections whose bottom-center point is outside the polygon are discarded.
Without a configured zone, the full frame is used.