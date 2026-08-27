#include <Wire.h>

#define SLAVE_ADDRESS 0x04

/*  Pin definitions for all axes  */
const int enPin = 8;

// X axis
const int stepXPin = 2;
const int dirXPin  = 5;

// Y axis
const int stepYPin = 3;
const int dirYPin  = 6;

// Z axis
const int stepZPin = 4;
const int dirZPin  = 7;

// A axis - Currently Doesnt work with my Sheild
//Testing Needed here
const int stepAPin = 12; // change if different
const int dirAPin  = 13; // change if different

/*  Motor timing  */
const int pulseWidthMicros = 100;   // step pulse width

const int DELAY_SLOW_MICROS = 1000; // slow
const int DELAY_FAST_MICROS = 500; // fast, open for change


/*  Command queue  */
#define QUEUE_SIZE 10

struct MotorCommand {
  char axis;       // X/Y/Z/A
  bool direction;  // true = down, false = up
  int steps;       // Testing todo to get rough amount to syringe measure's
  int stepDelayUs; // per-command delay
};

MotorCommand commandQueue[QUEUE_SIZE];
//Lets this break out of loop(), and interrupts
//Will need testing if we want to move away from this for corruption reasons
volatile int queueHead = 0;
volatile int queueTail = 0;

/*  Execution state (shared with cancel interrupt)  */
volatile bool busy = false;
volatile int stepsRemaining = 0;
volatile bool cancelRequested = false;

/*  Queue helpers  */
bool queueIsEmpty() { return queueHead == queueTail; }
bool queueIsFull() { return ((queueTail + 1) % QUEUE_SIZE) == queueHead; }

bool enqueueCommand(char axis, bool direction, int steps, int stepDelayUs) {
  if (queueIsFull()) return false;
  commandQueue[queueTail] = {axis, direction, steps, stepDelayUs};
  queueTail = (queueTail + 1) % QUEUE_SIZE;
  return true;
}

bool dequeueCommand(MotorCommand &cmd) {
  if (queueIsEmpty()) return false;
  cmd = commandQueue[queueHead];
  queueHead = (queueHead + 1) % QUEUE_SIZE;
  return true;
}

void clearQueue() {
  queueHead = 0;
  queueTail = 0;
}

// Called from the I2C interrupt, flag cancel and drop queued commands.
// Stopping the active move happens in loop().
void requestCancel() {
  cancelRequested = true;
  clearQueue();
}

// Pi reads to know if motor is still moving.
void isMotorActive() {
  return busy || !queueIsEmpty();
}

// I2C master reads 1 byte - 1 = moving, 0 = idle.
void sendStatus() {
  Wire.write(isMotorActive() ? 1 : 0)
}

/*  Axis selection helper  */
int stepPin;
int dirPin;

bool selectAxis(char axis) {
  switch (axis) {
    case 'X':
      stepPin = stepXPin; dirPin = dirXPin; break;
    case 'Y':
      stepPin = stepYPin; dirPin = dirYPin; break;
    case 'Z':
      stepPin = stepZPin; dirPin = dirZPin; break;
    case 'A':
      stepPin = stepAPin; dirPin = dirAPin; break;
    default:
      return false;
  }
  pinMode(stepPin, OUTPUT);
  pinMode(dirPin, OUTPUT);
  return true;
}

/*  Setup  */
void setup() {
  Wire.begin(SLAVE_ADDRESS); //Basic Default Address
  Wire.onReceive(receiveData);
  Wire.onRequest(sendStatus);

  pinMode(enPin, OUTPUT);
  digitalWrite(enPin, LOW); // enable motors
}

/*  Main loop  */
void loop() {
  if (!busy) {
    delay(10); //We can speed this up later
  }

  static MotorCommand currentCmd;

  // Cancel: stop the active move and ensure the queue is empty.
  if (cancelRequested) {
    busy = false;
    stepsRemaining = 0;
    clearQueue();
    cancelRequested = false;
    return;
  }

  if (!busy) {
    if (dequeueCommand(currentCmd)) {
      if (!selectAxis(currentCmd.axis)) return;
      digitalWrite(dirPin, currentCmd.direction ? HIGH : LOW);
      stepsRemaining = currentCmd.steps;
      busy = true;
    }
  }

  if (busy && stepsRemaining > 0) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(pulseWidthMicros);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(currentCmd.stepDelayUs);
    stepsRemaining--;
  }

  if (busy && stepsRemaining == 0) busy = false;
}

/*  I2C receive handler  */
void receiveData(int howMany) {
  String received = "";

  // Cleaning Info, Removing dead bits
  if (Wire.available()) Wire.read(); // discard register byte
  while (Wire.available()) received += (char)Wire.read();
  received.trim();

  // Cancel if C is entered
  if (received == "C") {
    requestCancel();
    return;
  }

  if (received.length() < 5) return; // minimal valid "X up 1"

  // Parse axis, direction, steps
  char axis = received.charAt(0);
  int firstSpace = received.indexOf(' ');
  int secondSpace = received.indexOf(' ', firstSpace + 1);
  if (firstSpace == -1 || secondSpace == -1) return;

  int thirdSpace = received.indexOf(' ', secondSpace + 1);

  String dirStr = received.substring(firstSpace + 1, secondSpace);
  String stepsStr;
  char speedChar = 'S';  // default slow

  if (thirdSpace == -1) {
    stepsStr = received.substring(secondSpace + 1);
  } else {
    stepsStr = received.substring(secondSpace + 1, thirdSpace);
    String speedStr = received.substring(thirdSpace + 1);
    speedStr.trim();
    if (speedStr.length() > 0) {
      speedChar = speedStr.charAt(0);
      if (speedChar == 'f') speedChar = 'F';
      if (speedChar == 's') speedChar = 'S';
    }
  }

  int steps = stepsStr.toInt();
  if (steps <= 0) return;

  bool direction = false;
  if (dirStr == "down") direction = true;
  else if (dirStr == "up") direction = false;
  else return;

  int stepDelayUs = (speedChar == 'F') ? DELAY_FAST_MICROS : DELAY_SLOW_MICROS;
  enqueueCommand(axis, direction, steps, stepDelayUs);
}
