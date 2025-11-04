#!/bin/bash

# Test script to verify admin login works
echo "🔐 Testing admin login credentials..."

# Start backend server in background
echo "📡 Starting backend server..."
cd "$(dirname "$0")"
node backend/server.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test login
echo "🧪 Testing login with admin/password..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}')

echo "Login response: $LOGIN_RESPONSE"

# Check if login was successful
if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
    echo "✅ Admin login successful!"
    echo "Username: admin"
    echo "Password: password"
else
    echo "❌ Admin login failed!"
    echo "Response: $LOGIN_RESPONSE"
fi

# Cleanup
kill $SERVER_PID 2>/dev/null

echo "🔍 Current backend/data.json status:"
if [ -f backend/data.json ]; then
    echo "✅ data.json exists"
    echo "Users in data.json:"
    grep -A 10 '"users"' backend/data.json | head -15
else
    echo "❌ data.json not found"
fi