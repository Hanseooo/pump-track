# Arduino Firmware & Setup
## Arduino UNO R4 WiFi IoT Irrigation System

This document provides the full C++ firmware for the Arduino UNO R4 WiFi, instructions on setting up the Arduino IDE, calibrating the sensor, and designing for resilience (error handling).

### Prerequisites & IDE Setup

**Software Required:**
*   Arduino IDE 2.x — download from arduino.cc/en/software
*   Board: **Arduino UNO R4 WiFi** (install via Boards Manager)
*   Libraries: `WiFiS3` (built-in), `ArduinoHttpClient`, `ArduinoJson` v6 or v7

**Installing the Board:**
1. Open Arduino IDE → File → Preferences
2. Add this URL to Additional Boards Manager URLs: `https://downloads.arduino.cc/packages/package_index.json`
3. Go to Tools → Board → Boards Manager
4. Search for "Arduino UNO R4" and install the package
5. Select **Tools → Board → Arduino UNO R4 WiFi**

**Installing Libraries:**
1. Go to Tools → Manage Libraries
2. Search for "ArduinoHttpClient" by Arduino and install it
3. Search for "ArduinoJson" by Benoit Blanchon and install it.

### Configuration (`secrets.h`)
Create a file named `secrets.h` in the same folder as your `.ino` file. See `secrets.example.h` for the template.

### Full Arduino Code (`.ino`)
```cpp
#include <WiFiS3.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

// ── Pin definitions ───────────────────────────────────
#define MOISTURE_PIN  A0   // Analog input from soil sensor
#define RELAY_PIN     7    // Digital output to relay IN

// ── Settings (defaults, overridden by API) ────────────
int   readingIntervalMin = 5;   // Minutes between readings
int   dryThreshold       = 40;  // Auto-water if moisture below this %
int   pumpDurationSec    = 5;   // How long pump runs each cycle

// ── Sensor calibration ────────────────────────────────
// Calibrate by reading sensor in dry air and submerged in water
const int SENSOR_DRY  = 820;  // Raw ADC value in dry air
const int SENSOR_WET  = 380;  // Raw ADC value fully submerged

// ── WiFi & HTTP ───────────────────────────────────────
WiFiClient    wifi;
HttpClient    http(wifi, API_HOST, 443);

unsigned long lastReadingTime = 0;

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // HIGH = relay OFF (active LOW module)

  connectWiFi();
  fetchSettings(); // Pull threshold + interval from server on startup
}

void loop() {
  unsigned long now = millis();
  unsigned long interval = (unsigned long)readingIntervalMin * 60 * 1000;

  if (now - lastReadingTime >= interval || lastReadingTime == 0) {
    lastReadingTime = now;

    // 1. Read Sensor
    int moisture = readMoisture();
    Serial.print("Moisture: "); Serial.print(moisture); Serial.println("%");

    // 2. Post to Backend
    bool apiSuccess = sendReading(moisture);
    
    // 3. Handle Commands or Offline Fallback
    if (apiSuccess) {
      checkCommand(); // Get manual triggers or server-computed auto-triggers
    } else {
      // OFFLINE FALLBACK: If API fails, rely on local logic
      Serial.println("API unreachable. Using local offline fallback logic.");
      if (moisture < dryThreshold) {
        runPump();
      }
    }
  }
}

// ── Read & map moisture sensor ────────────────────────
int readMoisture() {
  int raw = analogRead(MOISTURE_PIN);
  int pct = map(raw, SENSOR_DRY, SENSOR_WET, 0, 100);
  return constrain(pct, 0, 100);
}

// ── Send moisture reading to API ─────────────────────
bool sendReading(int moisture) {
  if (WiFi.status() != WL_CONNECTED) connectWiFi(); // Reconnect if dropped

  String body = "{\"moisture\":";
  body += moisture;
  body += "}";

  http.beginRequest();
  http.post("/api/reading");
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("x-api-key", API_KEY);
  http.sendHeader("Content-Length", body.length());
  http.beginBody();
  http.print(body);
  http.endRequest();

  int statusCode = http.responseStatusCode();
  Serial.print("POST /api/reading -> "); Serial.println(statusCode);
  return (statusCode >= 200 && statusCode < 300);
}

// ── Check for pump command from server ───────────────
void checkCommand() {
  http.beginRequest();
  http.get("/api/command");
  http.sendHeader("x-api-key", API_KEY);
  http.endRequest();

  int statusCode = http.responseStatusCode();
  String responseBody = http.responseBody();

  if (statusCode == 200) {
    StaticJsonDocument<128> doc;
    deserializeJson(doc, responseBody);
    bool shouldPump = doc["pump"];
    if (shouldPump) {
      runPump();
    }
  }
}

// ── Run the pump for configured duration ─────────────
void runPump() {
  Serial.println("Pump ON");
  digitalWrite(RELAY_PIN, LOW);     // LOW = relay ON
  delay(pumpDurationSec * 1000);
  digitalWrite(RELAY_PIN, HIGH);    // HIGH = relay OFF
  Serial.println("Pump OFF");
}

// ── Fetch settings from server ────────────────────────
void fetchSettings() {
  http.beginRequest();
  http.get("/api/settings");
  http.sendHeader("x-api-key", API_KEY);
  http.endRequest();

  if (http.responseStatusCode() == 200) {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, http.responseBody());
    readingIntervalMin = doc["intervalMin"] | 5;
    dryThreshold       = doc["threshold"]   | 40;
    pumpDurationSec    = doc["pumpSec"]     | 5;
    Serial.println("Settings loaded from server");
  }
}

// ── Connect to WiFi ───────────────────────────────────
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" Connected!");
    Serial.print("IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println(" WiFi failed!");
  }
}
```

---

### Sensor Calibration
The `SENSOR_DRY` and `SENSOR_WET` constants must be calibrated for your specific sensor. Default values are approximate.

1. Open Arduino IDE Serial Monitor (115200 baud).
2. Upload the code, open Serial Monitor.
3. Hold the sensor in dry air — note the raw analog value (add `Serial.println(analogRead(A0))` temporarily).
4. Submerge the sensor probe in water — note the raw value.
5. Update `SENSOR_DRY` and `SENSOR_WET` with your readings.

*Typical range: ~820 dry, ~380 wet. Your values may differ slightly depending on the sensor batch.*

---

### Error Handling: Tradeoffs & Recommendations

In any IoT project, the internet will eventually go down (WiFi drop, API outage, DNS failure). How the Arduino responds is critical to keeping your plants alive.

#### Tradeoff 1: Simple (Fail Silently)
*   **How it works**: The Arduino tries to hit the API. If it fails, it prints an error to the Serial monitor and does nothing until the next loop.
*   **Pros**: Extremely simple code. No complex state management.
*   **Cons**: If the internet goes down while you are on vacation, the plant never gets watered and dies.

#### Tradeoff 2: Aggressive Retry Loop
*   **How it works**: If an API call fails, immediately delay and try again, repeating 3-5 times.
*   **Pros**: Highly resilient to temporary hiccups (e.g., router rebooting).
*   **Cons**: "Blocking" code. The Arduino will hang in the `while` loop, preventing other local tasks (like reading sensors or updating a local LCD) from running.

#### Tradeoff 3: Offline Fallback (Recommended)
*   **How it works**: The Arduino *attempts* to communicate with the cloud. If the API succeeds, the cloud is the source of truth for pump commands. If the API fails, the Arduino falls back to a **local decision**: *"Is moisture < dryThreshold? If yes, run the pump."*
*   **Pros**: Maximum resilience. The plant survives even if the backend Vercel server is offline for days.
*   **Cons**: The dashboard won't have a log of the offline watering events (unless you build complex queueing systems locally).

#### Our Recommendation & Implementation
The code provided above implements **Tradeoff 3: Offline Fallback** mixed with a minor WiFi reconnect attempt. 

Look at the `loop()` function:
```cpp
bool apiSuccess = sendReading(moisture);

if (apiSuccess) {
  checkCommand(); // Cloud decides
} else {
  // OFFLINE FALLBACK: Local decision
  if (moisture < dryThreshold) {
    runPump();
  }
}
```
This ensures that the primary job of the system (keeping the plant alive) never fails just because of a networking issue.