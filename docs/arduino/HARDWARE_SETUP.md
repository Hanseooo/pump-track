# Hardware Setup & Wiring Guide
## Arduino UNO R4 WiFi IoT Irrigation System

This guide covers the minimum components needed, optional upgrades, and step-by-step wiring instructions for the pump and sensors.

### Core Parts (Required)
These are the minimum components needed to build the irrigation system.

| Component | Spec / Notes | Qty |
| :--- | :--- | :--- |
| **Arduino UNO R4 WiFi** | Main controller. Has built-in WiFi (ESP32-S3). Use USB-C port for power & programming. | 1 |
| **Capacitive Soil Moisture Sensor** | Capacitive type (NOT resistive). Look for 'Capacitive Soil Moisture Sensor v1.2'. Analog output, 3-pin. | 1 |
| **1-Channel Relay Module** | 5V coil relay, active LOW. Controls the water pump. Any generic 5V relay module works. | 1 |
| **5V Submersible Mini Pump** | Small fountain/aquarium pump. Draws ~200–300mA at 5V. Comes with short tubing. | 1 |
| **USB Power Bank** | Any power bank with 5V USB-A output. 5000mAh+ recommended. Must NOT auto shut-off. | 1 |
| **USB-A to USB-C Cable** | Powers the Arduino from the power bank. Standard cable. | 1 |
| **Breadboard** | Full-size (830 tie-points) preferred. Half-size works for this project. | 1 |
| **Jumper Wires** | Male-to-male and male-to-female sets. 40-piece sets are ideal. | 1 set |
| **Silicone Tubing** | Fits the pump outlet (~6–8mm inner diameter). 50cm is enough for a pot. | 50cm |

> **Note on Power Banks**: Brands like Anker, Xiaomi, or Baseus have models with 'always-on' mode. Avoid cheap no-brand ones that auto-shutoff after 30 seconds of low current draw.

### Optional Parts
These are not required but improve the project significantly.

| Component | What it adds | Difficulty |
| :--- | :--- | :--- |
| **Water Level Float Sensor** | Detects if water reservoir is empty. Prevents pump dry-running. | Easy |
| **DHT22 Temp & Humidity Sensor** | Adds temperature and humidity readings to the dashboard. | Easy |
| **16x2 I2C LCD Display** | Shows moisture level and pump status locally without needing the dashboard. | Easy |
| **Project Enclosure Box** | Protects the Arduino and breadboard from water splashes. | Easy |

---

## Wiring Guide

**Warning**: Never connect the pump directly to Arduino pins. Always route pump power through the relay. Arduino pins cannot supply enough current for a pump.

### Pin Reference Table
Use this table as your master reference while wiring.

| Component | Component Pin | Arduino Pin | Notes |
| :--- | :--- | :--- | :--- |
| **Soil Moisture Sensor** | VCC | 3.3V | Use 3.3V not 5V for capacitive sensors |
| **Soil Moisture Sensor** | GND | GND | Any GND pin |
| **Soil Moisture Sensor** | AOUT | A0 | Analog signal pin |
| **Relay Module** | VCC | 5V | Powers the relay coil |
| **Relay Module** | GND | GND | Common ground |
| **Relay Module** | IN | D7 | Control signal from Arduino |
| **Relay Module** | COM | Power bank + (5V) | Common terminal of relay switch |
| **Relay Module** | NO | Pump + wire | Normally open — connects when relay triggers |
| **Pump** | + wire | Relay NO terminal | Switched via relay |
| **Pump** | - wire | Power bank - (GND) | Common ground |

### Step-by-Step Wiring

**Step 1 — Set up the breadboard power rails**
1. Connect the power bank's USB-A output to a USB-to-breadboard adapter or DC barrel jack breakout, and connect its `+` to the breadboard's red `(+)` rail and `-` to the blue `(-)` rail.
2. This 5V rail will power the relay module and pump directly.

**Step 2 — Wire the Soil Moisture Sensor**
1. Insert the sensor's connector into the breadboard.
2. `VCC` pin → breadboard row → Arduino `3.3V` pin (use a male-to-female jumper wire).
3. `GND` pin → breadboard row → Arduino `GND` pin.
4. `AOUT` pin → breadboard row → Arduino `A0` pin.

**Step 3 — Wire the Relay Module**
1. Place the relay module on or beside the breadboard.
2. `VCC` → Arduino `5V` pin.
3. `GND` → Arduino `GND` pin (or breadboard GND rail).
4. `IN` → Arduino `D7` pin.
5. `COM` terminal → breadboard 5V `(+)` rail (this is the input power to the switch).
6. `NO` terminal → pump's red `(+)` wire.

**Step 4 — Wire the Pump**
1. Connect the pump's red `(+)` wire to the relay's `NO` terminal.
2. Connect the pump's black `(-)` wire to the breadboard `GND (-)` rail.
3. Place the pump in your water reservoir (a small bowl or container works fine for demo).
4. Route the silicone tubing from the pump outlet to the plant pot.

**Step 5 — Power the Arduino**
1. Plug the USB-C cable from the power bank into the Arduino's USB-C port.
2. The Arduino power LED (green) should turn on.

**Step 6 — Verify before uploading code**
1. Check all GND connections share a common ground (sensor GND, relay GND, pump GND, and Arduino GND must all connect).
2. Double-check relay `IN` is on `D7`.
3. Double-check sensor `AOUT` is on `A0`.
4. **Do NOT place the pump in water until after verifying the code works.**

### Common Wiring Mistakes
| Mistake | Symptom | Fix |
| :--- | :--- | :--- |
| **Sensor on 5V instead of 3.3V** | Sensor gives erratic readings or gets hot | Move VCC wire to 3.3V pin |
| **Pump wired directly to Arduino 5V** | Arduino resets or burns out | Wire pump through relay COM/NO only |
| **Relay IN on wrong pin** | Pump never turns on/off | Check code uses D7, rewire if needed |
| **No common GND** | Sensor reads 0 or max constantly | Ensure all GND wires share the same rail |
| **NO and NC swapped on relay** | Pump always on, never turns off | Use NO terminal, not NC |
