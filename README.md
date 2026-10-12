# MOSMAGE

**Modular Open-Source Multiplex Automated Genome Engineering**

An open-source control system for automated genome engineering, built by the University of Lethbridge iGEM team. MOSMAGE pairs a web-based control interface with a Raspberry Pi backend and Arduino-driven hardware modules to build, run, and monitor automated engineering cycles.

---

## Overview

MOSMAGE coordinates the hardware used in a multiplex genome engineering workflow and exposes it through a browser-based interface. It provides:

- A visual, node-based Control Interface for building and running cycles
- A backend on a Raspberry Pi 4 that drives the hardware and saves cycles
- An AI agent that can generate cycles from plain-language requests, with provider fallback and bring-your-own-key support
- Modular hardware support, so modules can be added or swapped

---

## Architecture

| Component | Stack | Role |
|---|---|---|
| Control Interface | React, React Flow | Building, running, and monitoring cycles |
| Backend | Node.js, Express | Hardware control and the REST API (`/api`) |
| Persistence | SQLite (`better-sqlite3`) | Cycle storage |
| Firmware | Arduino (C/C++) | Low-level module control |
| Host | Raspberry Pi 4 | Runs the backend as semi-permanent hardware |

Cycles are run step by step from the Control Interface. Each node is sent to the backend in order, and the next step starts once the hardware reports it is finished.

### Hardware modules

| Module | Node | Connection |
|---|---|---|
| Peristaltic pump | `peristalticPump` | I2C, via a TCA9548A multiplexer |
| Syringe pumps | `syringePump` | I2C, via a TCA9548A multiplexer |
| Spectrophotometer | `spectrometer` | USB serial, 115200 baud |
| Electroporator | `electroporator` | USB serial, 115200 baud (in development) |
| Media exchange unit | — | Not yet in the interface |

The pump boards share I2C address `0x04`. The backend selects a board through the TCA9548A (`0x70`) and three GPIO pins, then sends the move and polls until the motor is idle. Serial devices are chosen from a port dropdown on their node.

### AI agent

The built-in agent tries providers in a fixed order: **Gemini → OpenRouter → Ollama** (local). Gemini and OpenRouter use a bring-your-own-key (BYOK) model; keys are stored only in `my-app/server/.env` on the machine running the backend. Currently, only free OpenRouter models are allowed.

---

## Repository Structure

| Path | Purpose |
|---|---|
| `my-app/` | React Control Interface |
| `my-app/server/` | Express backend, SQLite database, AI agent |
| `my-app/server/context/` | Reference material the AI agent reads |
| `ArduinoScript/MotorScript/` | Pump firmware (I2C) |
| `ArduinoScript/SpecFile` | Spectrophotometer firmware (serial) |
| `PiScript/` | Legacy Raspberry Pi Python scripts, superseded by the Node.js backend |

---

## Getting Started

### Prerequisites

- Node.js and npm
- Raspberry Pi 4 with I2C enabled (the backend needs the Pi's I2C bus and GPIO to start)
- Arduino IDE (for firmware uploads)
- Optional, for the AI agent: a Gemini or OpenRouter API key, or a local [Ollama](https://ollama.com) install

### 1. Clone

```bash
git clone https://github.com/iGEM-2026/iGemApplication
cd iGemApplication/my-app
```

### 2. Install

The frontend and backend have separate dependencies. Install both:

```bash
npm install
npm --prefix server install
```

### 3. Run (development)

```bash
npm run dev
```

This starts the frontend at `http://localhost:3000` and the backend at `http://localhost:5001`. The frontend forwards `/api` requests to the backend.

To run them separately, use `npm start` (frontend) and `npm run server` (backend).

### 4. Run (on the Pi)

Build the frontend once, then start only the backend. It serves the interface and the API on one port:

```bash
npm run build
npm run server
```

Open `http://<pi-address>:5001`.

### 5. Firmware

1. Open the sketch in the Arduino IDE (for example `ArduinoScript/MotorScript/MotorScript.ino`)
2. Connect the board and select the correct board and port
3. Upload

### 6. AI agent (optional)

Open **Agent Settings** in the side menu and enter a Gemini or OpenRouter key. Keys are saved to `my-app/server/.env`, which is git-ignored.

The same file accepts these optional settings:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Gemini key |
| `OPENROUTER_API_KEY` | — | OpenRouter key |
| `OLLAMA_URL` | `http://localhost:11434` | Local Ollama server |
| `AGENT_MODEL_ID` | `gemini:gemini-3.1-flash-lite` | Default model |
| `AGENT_FALLBACK_MODEL_ID` | `ollama:qwen2.5:1.5b` | Fallback model |

---

## Using the Interface

1. Drag modules from the side menu onto the canvas
2. Connect them in the order they should run, edges can add a delay between steps
3. Fill in each node's settings (board, axis, steps, port, etc)
4. Save the cycle, or load a saved one
5. Set the number of cycles and press **Send All** to run; **Abort** stops the hardware

---

## License

MIT License.

## Acknowledgements

Built as part of iGEM to support interdisciplinary work in synthetic biology, hardware integration, and computational tooling.
