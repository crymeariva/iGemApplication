/*
 * Electroporator control unit (Arduino Nano)
 *
 * Pins
 *   D2  charge MOSFET     (blue LED)
 *   D3  discharge MOSFET  (red LED)     fires the capacitor into the cuvette
 *   D4  read MOSFET       (yellow LED)  connects the voltage divider; also the drain path
 *   D5  relay                           master power for the charging supply
 *   A0  voltage divider output
 *
 * Every discharge, STOP, and mid-phase power cut ends by draining the capacitor
 * through the read circuit, so the unit is never left charged.
 *
 * Serial protocol: 115200 baud, one command per line.
 *   Commands (reply OK, or ERR if invalid or the unit is busy):
 *     POWER 1|0                              relay on/off; POWER 0 during a phase aborts and drains
 *     CHARGE_TIME <ms>                       charge for a fixed time
 *     CHARGE_VOLT <v>                        charge until the capacitor reads <v>
 *     DISCHARGE_EXP <minV>                   discharge into the cuvette down to <minV>, then drain
 *     DISCHARGE_SQUARE <burstMs> <timeOnMs>  burst, recharge to max, repeat for <timeOnMs>, then drain
 *     READ                                   replies with the voltage instead of OK
 *     STOP                                   abort, relay off, drain
 *   Status lines sent by the unit:
 *     READY            booted, everything off
 *     SAMPLE <v>       voltage reading
 *     CHARGE_DONE      charge phase finished (capacitor holds its charge)
 *     DRAINING         drain started
 *     DISCHARGE_DONE   discharge and drain finished
 *     DRAIN_DONE       drain after STOP / power cut finished
 *     DRAIN_TIMEOUT    drain gave up before reaching SAFE_VOLTAGE; treat the capacitor as charged
 */

/* Pins */
const uint8_t PIN_CHARGE = 2;
const uint8_t PIN_DISCH = 3;
const uint8_t PIN_READ = 4;
const uint8_t PIN_RELAY = 5;
const uint8_t PIN_ADC = A0; //need voltage divider circuit

/* Placeholders */
const float DIVIDER_RATIO = 5.0;          // capacitor volts per volt at A0
const float MAX_VOLTAGE = 1400.0;         // highest charge target; square wave recharges to this
const float MIN_DISCHARGE_VOLT = 12.0;    // lowest exponential discharge floor
const float SAFE_VOLTAGE = 5.0;           // drain is complete at or below this

const unsigned long BURST_MIN_MS = 10;
const unsigned long BURST_MAX_MS = 50;
const unsigned long TIME_ON_MIN_MS = 1000UL;
const unsigned long TIME_ON_MAX_MS = 600000UL;

/* Timing */
const unsigned long READ_PULSE_MS = 5;           // read MOSFET on-time per sample (keep under 1 s)
const unsigned long SAMPLE_INTERVAL_MS = 2000;   // sampling while charging / exponential discharge
const unsigned long RECHARGE_SAMPLE_MS = 100;    // sampling during square-wave recharges
const unsigned long RECHARGE_TIMEOUT_MS = 10000; // a recharge that can't reach MAX_VOLTAGE fires anyway after this
const unsigned long DRAIN_SAMPLE_MS = 500;
const unsigned long DRAIN_MIN_MS = 2000;         // always drain at least this long
const unsigned long DRAIN_TIMEOUT_MS = 60000;    // report DRAIN_TIMEOUT after this

/* State machine */
enum State { IDLE, CHARGE_TIME, CHARGE_VOLT, DISCH_EXP, SQUARE_BURST, SQUARE_RECHARGE, DRAIN, READING };

State state = IDLE;
State resumeState = IDLE;      // state to return to after a READING pulse

unsigned long phaseStart = 0;  // start of the current charge, discharge, or time-on period
unsigned long stepStart = 0;   // start of the current burst, recharge, or drain
unsigned long readStart = 0;   // start of the current READING pulse
unsigned long lastSample = 0;

unsigned long chargeDurationMs = 0;
float targetVolts = 0;
float minVolts = 0;
unsigned long burstMs = 0;
unsigned long timeOnMs = 0;
bool drainAfterStop = false;   // DRAIN_DONE after an abort, DISCHARGE_DONE after a discharge
float lastVoltage = 0;

/* Helpers */

void allOff() {
  digitalWrite(PIN_CHARGE, LOW);
  digitalWrite(PIN_DISCH, LOW);
  digitalWrite(PIN_READ, LOW);
}

// Only valid while the read MOSFET is on.
float readAdc() {
  return analogRead(PIN_ADC) * (5.0 / 1023.0) * DIVIDER_RATIO;
}

void reportSample(float v) {
  lastVoltage = v;
  Serial.print("SAMPLE ");
  Serial.println(v, 2);
}

// Pauses charging/discharging and pulses the read MOSFET; loop() takes the
// reading after READ_PULSE_MS and returns to `after`.
void enterRead(State after) {
  resumeState = after;
  state = READING;
  readStart = lastSample = millis();
  digitalWrite(PIN_CHARGE, LOW);
  digitalWrite(PIN_DISCH, LOW);
  digitalWrite(PIN_READ, HIGH);
}

void resume(State s, uint8_t pin) {
  state = s;
  digitalWrite(pin, HIGH);
}

/* Phase starts */

void startChargeTime(unsigned long ms) {
  allOff();
  chargeDurationMs = ms;
  phaseStart = lastSample = millis();
  resume(CHARGE_TIME, PIN_CHARGE);
}

void startChargeVolt(float target) {
  allOff();
  targetVolts = target;
  phaseStart = lastSample = millis();
  resume(CHARGE_VOLT, PIN_CHARGE);
}

void startDischExp(float minV) {
  allOff();
  minVolts = minV;
  phaseStart = lastSample = millis();
  resume(DISCH_EXP, PIN_DISCH);
}

void startBurst() {
  digitalWrite(PIN_CHARGE, LOW);
  stepStart = millis();
  resume(SQUARE_BURST, PIN_DISCH);
}

void startRecharge() {
  digitalWrite(PIN_DISCH, LOW);
  stepStart = lastSample = millis();
  resume(SQUARE_RECHARGE, PIN_CHARGE);
}

void startDischSquare(unsigned long burst, unsigned long timeOn) {
  allOff();
  burstMs = burst;
  timeOnMs = timeOn;
  phaseStart = millis();
  startBurst();
}

// Empties the capacitor through the read circuit. The relay is cut so nothing can recharge it.
void startDrain(bool afterStop) {
  allOff();
  digitalWrite(PIN_RELAY, LOW);
  digitalWrite(PIN_READ, HIGH);
  drainAfterStop = afterStop;
  stepStart = lastSample = millis();
  state = DRAIN;
  Serial.println("DRAINING");
}

void finishDrain(const char* line) {
  allOff();
  state = IDLE;
  Serial.println(line);
}

/* Command parsing */

// AVR sscanf has no %f, so voltages are read as text and converted with atof().
void handleCommand(char* line) {
  char vbuf[16];
  unsigned long u1, u2;
  int n;
  float f1;
  bool idle = (state == IDLE);

  if (sscanf(line, "POWER %d", &n) == 1) {
    if (n) {
      if (state == DRAIN) { Serial.println("ERR"); return; }
      digitalWrite(PIN_RELAY, HIGH);
    } else if (idle || state == DRAIN) {
      digitalWrite(PIN_RELAY, LOW);
    } else {
      startDrain(true);  // power cut mid-phase is an abort
    }
    Serial.println("OK");
  }
  else if (sscanf(line, "CHARGE_TIME %lu", &u1) == 1) {
    if (idle && u1 > 0) { startChargeTime(u1); Serial.println("OK"); }
    else Serial.println("ERR");
  }
  else if (sscanf(line, "CHARGE_VOLT %15s", vbuf) == 1) {
    f1 = atof(vbuf);
    if (idle && f1 > 0 && f1 <= MAX_VOLTAGE) { startChargeVolt(f1); Serial.println("OK"); }
    else Serial.println("ERR");
  }
  else if (sscanf(line, "DISCHARGE_EXP %15s", vbuf) == 1) {
    f1 = atof(vbuf);
    if (idle && f1 >= MIN_DISCHARGE_VOLT && f1 <= MAX_VOLTAGE) { startDischExp(f1); Serial.println("OK"); }
    else Serial.println("ERR");
  }
  else if (sscanf(line, "DISCHARGE_SQUARE %lu %lu", &u1, &u2) == 2) {
    bool valid = u1 >= BURST_MIN_MS && u1 <= BURST_MAX_MS && u2 >= TIME_ON_MIN_MS && u2 <= TIME_ON_MAX_MS;
    if (idle && valid) { startDischSquare(u1, u2); Serial.println("OK"); }
    else Serial.println("ERR");
  }
  else if (strcmp(line, "READ") == 0) {
    if (idle) {
      digitalWrite(PIN_READ, HIGH);
      delay(READ_PULSE_MS);
      lastVoltage = readAdc();
      digitalWrite(PIN_READ, LOW);
    } else if (state == DRAIN) {
      lastVoltage = readAdc();
    }
    // Mid-phase, report the latest sample rather than interrupting the phase.
    Serial.println(lastVoltage, 2);
  }
  else if (strcmp(line, "STOP") == 0) {
    startDrain(true);
    Serial.println("OK");
  }
  else {
    Serial.println("ERR");
  }
}

char buf[64];
uint8_t bufLen = 0;

// Collects serial characters into `buf` without blocking; runs a command on each newline.
void pollSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      buf[bufLen] = '\0';
      if (bufLen > 0) handleCommand(buf);
      bufLen = 0;
    } else if (bufLen < sizeof(buf) - 1) {
      buf[bufLen++] = c;
    }
  }
}

/* Main loop */

// Takes the reading at the end of a READING pulse and decides what happens next.
void finishRead() {
  reportSample(readAdc());
  digitalWrite(PIN_READ, LOW);

  switch (resumeState) {
    case CHARGE_TIME:
      if (millis() - phaseStart >= chargeDurationMs) { state = IDLE; Serial.println("CHARGE_DONE"); }
      else resume(CHARGE_TIME, PIN_CHARGE);
      break;
    case CHARGE_VOLT:
      if (lastVoltage >= targetVolts) { state = IDLE; Serial.println("CHARGE_DONE"); }
      else resume(CHARGE_VOLT, PIN_CHARGE);
      break;
    case DISCH_EXP:
      if (lastVoltage <= minVolts) startDrain(false);
      else resume(DISCH_EXP, PIN_DISCH);
      break;
    case SQUARE_RECHARGE:
      if (lastVoltage >= MAX_VOLTAGE) startBurst();
      else resume(SQUARE_RECHARGE, PIN_CHARGE);
      break;
    default:
      state = IDLE;
      break;
  }
}

void setup() {
  // Drive every output low before enabling it so nothing pulses on at boot.
  const uint8_t outputs[] = { PIN_CHARGE, PIN_DISCH, PIN_READ, PIN_RELAY };
  for (uint8_t pin : outputs) {
    digitalWrite(pin, LOW);
    pinMode(pin, OUTPUT);
  }
  Serial.begin(115200);
  Serial.println("READY");
}

void loop() {
  pollSerial();
  unsigned long now = millis();

  switch (state) {
    case IDLE:
      break;

    case CHARGE_TIME:
      if (now - phaseStart >= chargeDurationMs) {
        digitalWrite(PIN_CHARGE, LOW);
        state = IDLE;
        Serial.println("CHARGE_DONE");
      } else if (now - lastSample >= SAMPLE_INTERVAL_MS) {
        enterRead(CHARGE_TIME);
      }
      break;

    case CHARGE_VOLT:
    case DISCH_EXP:
      // Both finish on a voltage threshold, checked in finishRead().
      if (now - lastSample >= SAMPLE_INTERVAL_MS) enterRead(state);
      break;

    case SQUARE_BURST:
      if (now - stepStart >= burstMs) {
        if (now - phaseStart >= timeOnMs) startDrain(false);
        else startRecharge();
      }
      break;

    case SQUARE_RECHARGE:
      if (now - phaseStart >= timeOnMs) startDrain(false);
      else if (now - stepStart >= RECHARGE_TIMEOUT_MS) startBurst();  // as charged as the hardware gets
      else if (now - lastSample >= RECHARGE_SAMPLE_MS) enterRead(SQUARE_RECHARGE);
      break;

    case DRAIN:
      if (now - lastSample >= DRAIN_SAMPLE_MS) {
        lastSample = now;
        reportSample(readAdc());
        if (now - stepStart >= DRAIN_MIN_MS && lastVoltage <= SAFE_VOLTAGE) {
          finishDrain(drainAfterStop ? "DRAIN_DONE" : "DISCHARGE_DONE");
        } else if (now - stepStart >= DRAIN_TIMEOUT_MS) {
          finishDrain("DRAIN_TIMEOUT");
        }
      }
      break;

    case READING:
      if (now - readStart >= READ_PULSE_MS) finishRead();
      break;
  }
}
