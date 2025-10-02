# TrollSports Live

Welcome to TrollSports Live! This guide explains the TrollSports Live system, including the sensor hardware and the web interface.

---

## Sensor System

The TrollSports sensor system uses a 4G modem to transfer data to the web interface. Data transfer is billed like a regular phone subscription, so **please turn off the sensor unit when not in use**.

- **Sampling Rate:** Data is sampled at 10Hz (ten times per second).
- **GPS:** Requires a clear view of the sky. Expect some initial position jumps when powering on; the signal stabilizes after a short time.
- **Waterproofing:** The electronics are **not waterproof**. Always close the sensor box properly before going on the water.

### Powering On/Off

1. **Plug in the power cable.**
2. **Wait for initiation:** The screen will display status messages (4G setup, etc.).
3. **Ready:** When the screen goes black, the unit is ready.
4. **Power off:** Unplug the power cable after your session to save power.

### Status & Tare Button

- The control unit (yellow) has a large **M5 button** on the front.
- **Press once:** Shows status of LTE (internet), IMU (orientation), and GPS (position).
- **Tare orientation angles:** After the first press, wait for "press again to tare angles," then press again.  
  - **Important:** Fasten the sensor box securely and position it perfectly flat on land before taring. Stored values are saved for next time.
- **Reset orientation calibration:** Long press the M5 button for 5 seconds to remove stored angle values.

### Power & Charging

- Powered by a small powerbank underneath the sensor unit.
- Recharge via USB-C.
- **Do not remove** the sensor unit or powerbank from the sensor box.

---

## Web Interface

The web interface is located at [github-io/split_index/index.html](https://eirikese.github.io/tsp/). It receives messages from sensor units and plots them in real time. Expect delays of less than one second.

### Tabs Overview

- **Home:** Live stream of data from connected units, timeseries plot of Heel and SOG/VMG.
- **Heel:** Distribution plots of heel data from the last 30 seconds
- **Reports:** Generate and view session summaries and statistics.
- **•••** Settings, configure display options and name/color sensor units.
- **Record Button:** In top right corner, record data and get instant summaries in Reports tab. Also downloads a csv file for storage.

## Quick Start

1. **Set up the sensor unit** as described above.
2. **Open the web interface** in your browser
3. **Start Training**
4. **Review your data** in real time or after your session.