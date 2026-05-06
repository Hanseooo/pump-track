# Arduino API Contracts & Usage
## Arduino UNO R4 WiFi IoT Irrigation System

The Arduino R4 WiFi communicates with the Next.js Vercel backend using REST API calls. 
This document acts as the bridge between the physical hardware and the cloud database, defining exactly how the Arduino should format its HTTP requests.

### Authentication
All Arduino-facing routes are protected by a simple, secret API key header.

**Required Header for `POST /api/reading` and `GET /api/command`:**
```http
x-api-key: <YOUR_ARDUINO_API_KEY>
```
*Note: This key must exactly match the `ARDUINO_API_KEY` environment variable deployed on your Vercel project.*

---

### Endpoint 1: Fetch Settings on Startup

**`GET /api/settings`**

When the Arduino powers on, it should fetch its operating parameters from the cloud. This allows you to change how often the Arduino wakes up or how long it waters without needing to plug it into your laptop and re-flash the code.

*   **Auth Required**: No (Dashboard uses this too).
*   **Headers**: None required, though passing `x-api-key` is safe.
*   **Request Body**: None
*   **Success Response** (`200 OK`):
    ```json
    {
      "threshold": 40,
      "intervalMin": 5,
      "pumpSec": 5
    }
    ```
    *   `threshold`: The percentage moisture at which the plant needs water.
    *   `intervalMin`: How often the Arduino should wake up to read the sensor and call the API (e.g., 5 minutes).
    *   `pumpSec`: How long the relay/pump should stay ON when triggered (e.g., 5 seconds).

---

### Endpoint 2: Submit Sensor Reading

**`POST /api/reading`**

The Arduino runs this every `intervalMin` minutes to report the current soil moisture.

*   **Auth Required**: Yes (`x-api-key`)
*   **Headers**:
    ```http
    Content-Type: application/json
    x-api-key: <YOUR_API_KEY>
    ```
*   **Request Body**:
    ```json
    {
      "moisture": 35
    }
    ```
    *   `moisture`: An integer from `0` to `100` representing the soil moisture percentage.
*   **Success Response** (`200 OK`):
    ```json
    {
      "ok": true,
      "shouldPump": true
    }
    ```
    *   The backend evaluates if the reading is below the `threshold`. If so, it flags `shouldPump` as `true` and queues a pump command in the Vercel KV store.

---

### Endpoint 3: Check for Pump Command

**`GET /api/command`**

Immediately after submitting a reading, the Arduino should check if a pump command is waiting in the queue. This command could have been generated automatically by a low reading, or manually by a user clicking "Water Now" on the dashboard.

*   **Auth Required**: Yes (`x-api-key`)
*   **Headers**:
    ```http
    x-api-key: <YOUR_API_KEY>
    ```
*   **Request Body**: None
*   **Success Response** (`200 OK`):
    ```json
    {
      "pump": true
    }
    ```
    *   `pump`: A boolean value. `true` means the Arduino should activate the relay immediately for `pumpSec` seconds. `false` means do nothing.
    *   **Crucial Behavior Note**: Calling this endpoint *consumes* the command. If you call it and receive `true`, the command is deleted from Vercel KV. If you call it a second time immediately after, it will return `false`. This prevents accidental double-watering.

---

### Flow Diagram

Here is how the API calls structure the Arduino's behavior in `loop()`:

1. Delay for `intervalMin`
2. Read Sensor (A0)
3. `POST /api/reading` (Sends data to Supabase logs)
4. `GET /api/command` (Checks if Vercel KV says to run the pump)
   - If `true`: Turn on Relay (D7) for `pumpSec`
   - If `false`: Do nothing
5. Repeat.