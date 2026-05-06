// secrets.example.h
// ⚠️ INSTRUCTIONS: Rename this file to "secrets.h" before compiling your Arduino code.
// ⚠️ WARNING: DO NOT commit your actual "secrets.h" to public version control.

#ifndef SECRETS_H
#define SECRETS_H

// Replace with your local WiFi credentials
#define WIFI_SSID     "your_wifi_network_name"
#define WIFI_PASS     "your_wifi_password"

// Replace with your Vercel deployment URL 
// Note: Do NOT include "https://" or a trailing slash "/"
// Example: "pump-track-production.vercel.app"
#define API_HOST      "your-app.vercel.app"

// Replace with the exact value of ARDUINO_API_KEY from your Vercel Environment Variables
#define API_KEY       "your_secret_api_key_here"

#endif // SECRETS_H
