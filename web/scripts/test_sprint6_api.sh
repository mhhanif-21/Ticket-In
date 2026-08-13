#!/bin/bash
echo "=== 1. Uji Login Volunteer ==="
LOGIN_RES=$(curl -s -X POST http://localhost:3000/api/v1/auth/volunteer/login \
  -H "Content-Type: application/json" \
  -d '{"event_slug":"sprint-6-demo", "pin":"123456", "volunteer_name":"Tester API"}')

echo "Response Login:"
echo "$LOGIN_RES"

TOKEN=$(echo $LOGIN_RES | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')
if [ -z "$TOKEN" ]; then
  echo "Gagal mendapatkan token JWT!"
  exit 1
fi
echo -e "\nBerhasil mendapatkan Token: ${TOKEN:0:15}...\n"

echo "=== 2. Uji Scan Tiket Valid ==="
curl -s -X POST http://localhost:3000/api/v1/checkin/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ticket_code":"DEMO1234", "scan_method":"Camera"}' 

echo -e "\n=== 3. Uji Scan Duplikat ==="
curl -s -X POST http://localhost:3000/api/v1/checkin/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ticket_code":"DEMO1234", "scan_method":"Camera"}' 

echo -e "\n=== 4. Uji Scan Tiket Invalid/Pending ==="
curl -s -X POST http://localhost:3000/api/v1/checkin/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ticket_code":"PEND9999", "scan_method":"Camera"}' 

echo -e "\n=== 5. Uji Akses Tanpa Token ==="
curl -s -X POST http://localhost:3000/api/v1/checkin/scan \
  -H "Content-Type: application/json" \
  -d '{"ticket_code":"DEMO1234", "scan_method":"Camera"}' 
