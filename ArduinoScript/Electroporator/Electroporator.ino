// D2 charge
// D3 discharge
// D4 read
// D5 is relay, dont touch


/* Pin Roles */
const uint8_t PIN_RELAY = 5;
const uint8_t PIN_CHARGE = 2;
const uint8_t PIN_DISCH = 3;
const uint8_t PIN_READ = 4;
const uint8_t PIN_ADC = A0; //need voltage divider circuit

/* Placeholders */
const float DIVIDER_RATIO = 5.0; // placeholder
const unsigned long READ_PULSE_MS = 500; // can change, needs to be less than 1 sec
const unsigned long SAMPLE_INTERVAL = 2000; // how often to interrupt charge/discharge
const float MAX_VOLTAGE = 1400;

const float MIN_DISCHARGE_VOLT = 12.0;
const float MAX_DISCHARGE_VOLT = 1400.0;

/* State machine */ 
enum State {IDLE, CHARGE_TIME, CHARGE_VOLT, DISCH_EXP, DISCH_SQUARE, READING };
State state = IDLE; 
State resumeState = IDLE; // when a READING interrupt ends, which state to go back to

unsigned long stateStart = 0;
unsigned long chargeStartTime = 0;
unsigned long lastSample = 0;
unsigned long chargeDurationMs = 0;
float targetVolts = 0;
float minVolts = 0;
unsigned long burstMs = 0;         // burst length for DISCH_SQUARE
bool burstOn = false;              // is the current square-wave burst currently HIGH?
unsigned long burstStart = 0;      // when the current burst/gap began
float lastVoltage = 0;             // most recent voltage reading taken

/* Helpers */

// Everything off
void allOff() {
  digitalWrite(PIN_CHARGE, LOW);
  digitalWrite(PIN_DISCH, LOW);
  digitalWrite(PIN_READ, LOW);
}

// take one voltage reading. Switches off charge and discharge so they wont interfere.
float sampleVoltage() {
  digitalWrite(PIN_CHARGE, LOW);
  digitalWrite(PIN_DISCH, LOW);
  digitalWrite(PIN_READ, HIGH);
  delay(5); // let the voltage at the pin settle before sampling
  float v = analogRead(PIN_ADC) * (5.0 / 1023.0) * DIVIDER_RATIO;
  digitalWrite(PIN_READ, LOW);
  return v;
}

// switch into the READING state, but remember what we were doing before, so we can resume
// it once the reading is done.
void enterRead(State whereAfter) {
  resumeState = whereAfter;
  state = READING;
  stateStart = millis();
  digitalWrite(PIN_CHARGE, LOW);
  digitalWrite(PIN_DISCH, LOW);
  digitalWrite(PIN_READ, HIGH);
}

/* Start xyz functions */

void startChargeTime(unsigned long ms) {
  chargeDurationMs = ms;
  state = CHARGE_TIME;
  stateStart = millis();
  chargeStartTime = millis();
  lastSample = millis();
  digitalWrite(PIN_DISCH, LOW);
  digitalWrite(PIN_CHARGE, HIGH);
}

void startChargeVolt(float target) {
  targetVolts = target;
  state = CHARGE_VOLT;
  stateStart = millis();
  lastSample = millis();
  digitalWrite(PIN_DISCH, LOW);
  digitalWrite(PIN_CHARGE, HIGH);
}

void startDischExp(float minV) {
  minVolts = minV;
  state = DISCH_EXP;
  stateStart = millis();
  lastSample = millis();
  digitalWrite(PIN_CHARGE, LOW);
  digitalWrite(PIN_DISCH, HIGH);
}

void startDischSquare(unsigned long burst, float minV) {
  burstMs = burst;
  minVolts = minV;
  state = DISCH_SQUARE;
  stateStart = millis();
  burstStart = millis();
  burstOn = true;
  digitalWrite(PIN_CHARGE, LOW);
  digitalWrite(PIN_DISCH, HIGH);
}

// Abort
void stopAll() {
  state = IDLE;
  allOff();
}

/* Command Parsing */
// serial data arrives one character at a time
// pollSerial() collects characters into `buf` until it sees '\n'
// (the newline sent when you hit Enter in Serial Monitor), then
// hands the completed line to handleCommand(), which figures out
// which command it is and calls the right "start" function.

char buf[64]; // holds the line being typed/sent, one char at a time.
uint8_t bufLen = 0; // how many chars are in buf right now.

// decide what a completed line of text means, validate, and act on it.
// sscanf() is a template matcher
void handleCommand(char* line) {
  float f1;
  char vbuf[16];
  unsigned long u1;
  int n;

  if (sscanf(line, "POWER %d", &n) == 1) {
    // 1 or 0 to toggle the relay directly
    digitalWrite(PIN_RELAY, n ? HIGH : LOW);
    if (!n) stopAll(); // abort
    Serial.println("OK");
  } 
  else if (sscanf(line, "CHARGE_TIME %lu", &u1) == 1) {
    // charge for a fixed number of milliseconds
    startChargeTime(u1);
    Serial.println("OK");
  } 
  else if (sscanf(line, "CHARGE_VOLT %15s", vbuf) == 1) {
    //charge until the capacitor reads this voltage
    f1 = atof(vbuf);
    if (f1 > 0 && f1 <= MAX_VOLTAGE) { startChargeVolt(f1); Serial.println("OK"); }
    else Serial.println("ERR");
  }
  else if (sscanf(line, "DISCHARGE_EXP %15s", vbuf) == 1) {
    // "DISCHARGE_EXP 12" — hold discharge on until voltage drops to this floor
    f1 = atof(vbuf);
    if (f1 >= MIN_DISCHARGE_VOLT && f1 <= MAX_DISCHARGE_VOLT) { startDischExp(f1); Serial.println("OK"); }
    else Serial.println("ERR");
  }
  else if (sscanf(line, "DISCHARGE_SQUARE %lu %15s", &u1, vbuf) == 2) {
    // "DISCHARGE_SQUARE x y" — pulse discharge in "x"ms bursts until voltage hits y
    f1 = atof(vbuf);
    if (u1 >= 10 && u1 <= 50 && f1 >= MIN_DISCHARGE_VOLT && f1 <= MAX_DISCHARGE_VOLT) {
      startDischSquare(u1, f1); Serial.println("OK");
    } else Serial.println("ERR");
  } 
  else if (strcmp(line, "READ") == 0) {
    // take one voltage sample right now and print it
    lastVoltage = sampleVoltage();
    Serial.println(lastVoltage, 2);

  } 
  else if (strcmp(line, "STOP") == 0) {
    // abort everything, go to a safe idle state
    stopAll();
    Serial.println("OK");

  } 
  else {
    // Didn't match any known command, or failed a range check
    Serial.println("ERR");
  }
}

// Read whatever serial bytes have arrived so far (nmo blocking),
// building up buf char by char. When a newline shows up, the line is complete,
// so hand off to handleCommand and reset the buffer for next
void pollSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      buf[bufLen] = '\0';
      if (bufLen > 0) handleCommand(buf);
      bufLen = 0;
    } else if (bufLen < sizeof(buf) - 1) {
      buf[bufLen++] = c;
    }
  }
}

void setup() {
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_CHARGE, OUTPUT);
  pinMode(PIN_DISCH, OUTPUT);
  pinMode(PIN_READ, OUTPUT);
  stopAll();
  digitalWrite(PIN_RELAY, LOW);
  Serial.begin(115200);
  Serial.println("READY");
}

void loop() {
  pollSerial();
  unsigned long now = millis(); // current time, used everywhere below

  switch (state) {

    case IDLE:
      // waiting for a command.
      break;

    case CHARGE_TIME:
      if (now - lastSample >= SAMPLE_INTERVAL) {
        lastSample = now;
        enterRead(CHARGE_TIME);
      }
      else if (now - chargeStartTime >= chargeDurationMs) {
        digitalWrite(PIN_CHARGE, LOW);
        state = IDLE;
        Serial.println("CHARGE_DONE");
      }
      break;

    case CHARGE_VOLT:
      // Same periodic-read pattern as CHARGE_TIME, but there's no
      // fixed duration — whether we're done gets decided inside the
      // READING case below, once we see the actual voltage.
      if (now - lastSample >= SAMPLE_INTERVAL) {
        lastSample = now;
        enterRead(CHARGE_VOLT);
      }
      break;

    case DISCH_EXP:
      // Exponential-decay discharge: just hold the discharge MOSFET
      // on continuously, checking the voltage periodically to know
      // when to stop (handled in READING below).
      if (now - lastSample >= SAMPLE_INTERVAL) {
        lastSample = now;
        enterRead(DISCH_EXP);
      }
      break;

    case DISCH_SQUARE:
      // Square-wave discharge: alternate short ON bursts and brief
      // gaps. After each ON burst ends, we take a reading (to check
      // whether we've hit the target voltage) before starting the
      // next burst.
      if (burstOn && now - burstStart >= burstMs) {
        // This burst's ON time is over — turn off and sample.
        digitalWrite(PIN_DISCH, LOW);
        burstOn = false;
        enterRead(DISCH_SQUARE);
      } else if (!burstOn && now - burstStart >= burstMs * 2) {
        // Gap is over — start the next burst.
        digitalWrite(PIN_DISCH, HIGH);
        burstOn = true;
        burstStart = now;
      }
      break;

    case READING:
      // mid sample. Wait out the read pulse duration, then
      // take the actual reading and decide what happens next based
      // on which state we're resuming into.
      if (now - stateStart >= READ_PULSE_MS) {
        lastVoltage = sampleVoltage(); // also turns PIN_READ back off
        Serial.print("SAMPLE "); Serial.println(lastVoltage, 2);

        if (resumeState == CHARGE_VOLT) {
          // reached target? Stop and report done. Otherwise, resume charging.
          if (lastVoltage >= targetVolts) {
            digitalWrite(PIN_CHARGE, LOW);
            state = IDLE;
            Serial.println("CHARGE_DONE");
          } else {
            digitalWrite(PIN_CHARGE, HIGH);
            state = CHARGE_VOLT;
          }

        } else if (resumeState == CHARGE_TIME) {
          if (now - chargeStartTime >= chargeDurationMs) {
            state = IDLE;                       // time's up, don't turn charge back on
            Serial.println("CHARGE_DONE");
          } else {
            digitalWrite(PIN_CHARGE, HIGH);
            state = CHARGE_TIME;
          }

        } else if (resumeState == DISCH_EXP) {
          // Hit the floor? Stop and report done. Otherwise keep discharging.
          if (lastVoltage <= minVolts) {
            digitalWrite(PIN_DISCH, LOW);
            state = IDLE;
            Serial.println("DISCHARGE_DONE");
          } else {
            digitalWrite(PIN_DISCH, HIGH);
            state = DISCH_EXP;
          }

        } else if (resumeState == DISCH_SQUARE) {
            if (lastVoltage <= minVolts) {
              targetVolts = MAX_VOLTAGE;
              state = CHARGE_VOLT;
              stateStart = now;
              lastSample = now;
              digitalWrite(PIN_CHARGE, HIGH);
              Serial.println("DISCHARGE_DONE_AUTOCHARGE");
            } else {
            // Not there yet — start the next burst.
            burstStart = now;
            state = DISCH_SQUARE;
          }
        }
      }
      break;
  }
}
